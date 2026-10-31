// Talks to the AI. Two routes to the same stream:
//  - hosted: POST /api/rewrite (the Pages Function holds the key and builds the prompt)
//  - own key: straight to api.anthropic.com with the visitor's key, prompt built here
// Both return Anthropic's server-sent events, read by the same parser.

import { buildRequest } from "./prompt.js";

const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const HOSTED = "https://lz-rewrite.pages.dev/api/rewrite";

export const MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fast, low cost)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (higher quality)" },
];

/** Same-origin on Cloudflare and localhost; the GitHub Pages mirror calls the Cloudflare host. */
export function apiUrl(loc = location) {
  const h = loc.hostname;
  if (loc.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "lz-rewrite.pages.dev" || h.endsWith(".lz-rewrite.pages.dev")) {
    return "/api/rewrite";
  }
  return HOSTED;
}

export function looksLikeKey(key) {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(key).trim());
}

/** An error with a plain-language title, a "what to do" hint and an optional suggested action. */
export class ApiError extends Error {
  constructor(kind, title, hint, action = "") {
    super(title);
    this.kind = kind; // auth | rate | network | busy | bad-request | server | aborted | not-configured | origin
    this.title = title;
    this.hint = hint;
    this.action = action; // "settings" | "retry" | ""
  }
}

function waitLabel(secs) {
  if (!secs || secs < 1) return "a moment";
  if (secs < 90) return `${secs} s`;
  const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** Ask the Pages Function whether hosted AI is set up. Resolves "hosted", "not-configured" or "unreachable". */
export async function checkHealth(timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(), { method: "GET", signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return "unreachable";
    const j = await res.json().catch(() => null);
    if (!j || j.ok !== true) return "unreachable";
    return j.configured ? "hosted" : "not-configured";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(t);
  }
}

function hostedError(status, j) {
  const err = (j && j.error) || "";
  if (status === 503 && err === "not_configured") {
    return new ApiError("not-configured", "Hosted AI isn't set up on this copy.", "Add your own Anthropic API key in Settings, or try a template in demo mode.", "settings");
  }
  if (status === 429) {
    if (j && j.scope === "day") {
      return new ApiError("rate", "You've used today's free rewrites.", `Hosted rewrites are capped at ${j.limit || 60} a day. Try again in ${waitLabel(j.retryAfter)}, or add your own API key in Settings.`, "settings");
    }
    return new ApiError("rate", "That's a lot of rewrites in a minute.", `Hosted rewrites are limited to ${(j && j.limit) || 10} a minute. Try again in ${waitLabel(j && j.retryAfter)}.`, "retry");
  }
  if (status === 403) return new ApiError("origin", "This page can't use the hosted AI.", "Open Rewrite at lz-rewrite.pages.dev, or add your own API key in Settings.", "settings");
  if (status === 400) return new ApiError("bad-request", "That request wasn't accepted.", (j && j.message) || "Check your message and try again.", "");
  if (status === 503) return new ApiError("busy", "Claude is busy right now.", `Try again in ${waitLabel(j && j.retryAfter)}.`, "retry");
  return new ApiError("server", "The AI service had a problem.", "Try again in a moment. If it keeps happening, add your own key in Settings.", "retry");
}

function directError(status, type, message) {
  const detail = message || "";
  if (status === 401 || type === "authentication_error") {
    return new ApiError("auth", "Your API key was rejected.", "Open Settings and paste a valid key from console.anthropic.com. Keys start with sk-ant-.", "settings");
  }
  if (status === 403 || type === "permission_error") {
    return new ApiError("auth", "This key isn't allowed to use that model.", "Check the key's permissions in the Anthropic Console, or pick the other model in Settings.", "settings");
  }
  if (status === 429 || type === "rate_limit_error") {
    return new ApiError("rate", "Your API key hit its rate limit.", "Wait a minute and try again. Asking for fewer versions also helps.", "retry");
  }
  if (status === 529 || type === "overloaded_error") return new ApiError("busy", "Claude is busy right now.", "Try again in a few seconds.", "retry");
  if (status === 400 || status === 404 || type === "invalid_request_error" || type === "not_found_error") {
    if (/credit balance/i.test(detail)) {
      return new ApiError("bad-request", "Your Anthropic account is out of credit.", "Add credit in the Anthropic Console under Plans and billing, then try again.", "");
    }
    return new ApiError("bad-request", "The API couldn't accept this request.", detail ? `It said: "${detail}"` : "Try a shorter message, or switch model in Settings.", "settings");
  }
  return new ApiError("server", `The API returned an error${status ? ` (${status})` : ""}.`, "Try again in a moment. If it keeps happening, check status.anthropic.com.", "retry");
}

/**
 * Stream a rewrite. mode is "hosted" or "byok". payload is a validated request.
 * onText(fullTextSoFar) runs on every text delta. Resolves { text, stopReason }.
 */
export async function streamRewrite({ mode, payload, apiKey, model, onText, signal }) {
  let res;
  try {
    if (mode === "hosted") {
      res = await fetch(apiUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
    } else {
      if (!apiKey) throw new ApiError("auth", "No API key added yet.", "Add your Anthropic API key in Settings.", "settings");
      res = await fetch(ANTHROPIC, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model, stream: true, ...buildRequest(payload) }),
        signal,
      });
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err && err.name === "AbortError") throw new ApiError("aborted", "Stopped.", "");
    throw mode === "hosted"
      ? new ApiError("network", "Couldn't reach Rewrite's AI.", "Check your internet connection and try again.", "retry")
      : new ApiError("network", "Couldn't reach the Anthropic API.", "Check your connection. Some school or work networks block api.anthropic.com.", "retry");
  }

  if (!res.ok) {
    let j = null;
    try { j = await res.json(); } catch { /* not JSON */ }
    if (mode === "hosted") throw hostedError(res.status, j);
    throw directError(res.status, j && j.error && j.error.type, j && j.error && j.error.message);
  }
  if (!res.body) throw new ApiError("server", "The reply was empty.", "Try again.", "retry");
  return readStream(res.body, onText, mode, signal);
}

async function readStream(body, onText, mode, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "", stopReason = "";

  const handle = (raw) => {
    let data = "";
    for (const line of raw.split(/\r?\n/)) if (line.startsWith("data:")) data += line.slice(5).trimStart();
    if (!data) return;
    let evt;
    try { evt = JSON.parse(data); } catch { return; }
    if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
      full += evt.delta.text;
      if (onText) onText(full);
    } else if (evt.type === "message_delta" && evt.delta && evt.delta.stop_reason) {
      stopReason = evt.delta.stop_reason;
    } else if (evt.type === "error") {
      const t = evt.error && evt.error.type;
      throw t === "overloaded_error" ? new ApiError("busy", "Claude is busy right now.", "Try again in a few seconds.", "retry")
        : mode === "hosted" ? hostedError(500, null) : directError(0, t, evt.error && evt.error.message);
    }
  };

  try {
    for (;;) {
      if (signal && signal.aborted) {
        reader.cancel().catch(() => {});
        throw new ApiError("aborted", "Stopped.", "");
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, "");
        handle(raw);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handle(buffer);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err && err.name === "AbortError") throw new ApiError("aborted", "Stopped.", "");
    throw new ApiError("network", "The connection dropped mid-reply.", "Check your connection and try again.", "retry");
  }
  return { text: full, stopReason };
}
