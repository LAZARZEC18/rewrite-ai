// Cloudflare Pages Function: POST /api/rewrite
// Validates the request, builds the prompt on the server, calls the Anthropic
// Messages API with the project's own key, and streams the SSE reply straight
// back to the browser. The key never leaves Cloudflare.

import { validate, buildRequest } from "../../prompt.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-5-5";
const MINUTE_LIMIT = 10;
const DAY_LIMIT = 60;
const MAX_BODY = 20000; // bytes of JSON; the text itself is capped at 4,000 characters

// Per-isolate memory: good enough to stop bursts. KV (if bound) adds a daily cap.
const minuteHits = new Map();

/* ---------------------------------------------------------------- origins + CORS */

function isAllowedOrigin(origin) {
  if (!origin) return false;
  let u;
  try { u = new URL(origin); } catch { return false; }
  const host = u.hostname;
  if (u.protocol === "https:" && (host === "lz-rewrite.pages.dev" || host.endsWith(".lz-rewrite.pages.dev") || host === "lazarzec18.github.io")) {
    return true;
  }
  if ((u.protocol === "http:" || u.protocol === "https:") && (host === "localhost" || host === "127.0.0.1" || host === "[::1]")) {
    return true;
  }
  return false;
}

function corsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(status, data, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/* ---------------------------------------------------------------- rate limits */

function checkMinute(ip, now) {
  const recent = (minuteHits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= MINUTE_LIMIT) {
    minuteHits.set(ip, recent);
    return { ok: false, scope: "minute", retryAfter: Math.max(1, Math.ceil((60_000 - (now - recent[0])) / 1000)) };
  }
  recent.push(now);
  minuteHits.set(ip, recent);
  if (minuteHits.size > 5000) {
    for (const [k, list] of minuteHits) if (!list.length || now - list[list.length - 1] >= 60_000) minuteHits.delete(k);
  }
  return { ok: true };
}

async function checkDay(ip, now, kv) {
  if (!kv) return { ok: true };
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `day:${ip}:${day}`;
  try {
    const used = parseInt((await kv.get(key)) || "0", 10) || 0;
    if (used >= DAY_LIMIT) {
      const midnight = Date.parse(day + "T00:00:00Z") + 86_400_000;
      return { ok: false, scope: "day", retryAfter: Math.max(1, Math.ceil((midnight - now) / 1000)) };
    }
    await kv.put(key, String(used + 1), { expirationTtl: 172_800 });
  } catch {
    // KV hiccup: fail open, the per-minute limit still applies.
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- handlers */

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403, headers: { Vary: "Origin" } });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/** Health check: tells the page whether hosted AI is available. Never reveals the key. */
export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && !isAllowedOrigin(origin)) return json(403, { error: "forbidden_origin" }, { Vary: "Origin" });
  return json(200, { ok: true, configured: Boolean(env && env.ANTHROPIC_API_KEY) }, corsHeaders(origin));
}

export async function onRequestPost({ request, env }) {
  env = env || {};
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return json(403, { error: "forbidden_origin", message: "This site isn't allowed to use the Rewrite API." }, { Vary: "Origin" });
  const cors = corsHeaders(origin);

  if (!env.ANTHROPIC_API_KEY) return json(503, { error: "not_configured" }, cors);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(400, { error: "too_large", field: "text", message: "Messages can be up to 4,000 characters." }, cors);
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "invalid_json", message: "Send the request as JSON." }, cors); }

  const v = validate(body);
  if (!v.ok) return json(400, { error: "invalid_request", field: v.field, message: v.message }, cors);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const limit = checkMinute(ip, now);
  const day = limit.ok ? await checkDay(ip, now, env.RATE_KV) : limit;
  if (!day.ok) {
    return json(429, { error: "rate_limited", scope: day.scope, retryAfter: day.retryAfter, limit: day.scope === "day" ? DAY_LIMIT : MINUTE_LIMIT },
      { ...cors, "Retry-After": String(day.retryAfter) });
  }

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: env.ANTHROPIC_MODEL || DEFAULT_MODEL, stream: true, ...buildRequest(v.value) }),
    });
  } catch {
    return json(502, { error: "upstream_unreachable", message: "Couldn't reach the AI service." }, cors);
  }

  if (!upstream.ok || !upstream.body) {
    const s = upstream.status;
    if (s === 429 || s === 529 || s >= 500) {
      const ra = upstream.headers.get("retry-after");
      return json(503, { error: "busy", retryAfter: ra ? parseInt(ra, 10) || 5 : 5 }, cors);
    }
    if (s === 401 || s === 403) return json(502, { error: "upstream_auth" }, cors);
    return json(502, { error: "upstream_rejected", status: s }, cors);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
