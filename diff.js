// Word-level diff using a longest-common-subsequence table.
// Words are compared exactly (case and punctuation count), so "ok" -> "okay"
// and "i" -> "I" both show as changes. Whitespace is never diffed: each word
// carries the whitespace that follows it, so line breaks survive rendering.

/** Split text into [{ word, ws }] plus any leading whitespace. */
export function tokenize(text) {
  const tokens = [];
  const lead = (text.match(/^\s*/) || [""])[0];
  const re = /(\S+)(\s*)/g;
  let m;
  while ((m = re.exec(text)) !== null) tokens.push({ word: m[1], ws: m[2] });
  return { lead, tokens };
}

export function countWords(text) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Diff two token lists. Returns ops: [{ type: "same" | "del" | "add", a?, b? }]
 * where a / b are indexes into the before / after token lists.
 */
export function diffTokens(a, b) {
  const ops = [];
  // Trim the common prefix and suffix first: cheap, and keeps the table small.
  let start = 0;
  while (start < a.length && start < b.length && a[start].word === b[start].word) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1].word === b[endB - 1].word) { endA--; endB--; }

  for (let i = 0; i < start; i++) ops.push({ type: "same", a: i, b: i });

  const n = endA - start, m = endB - start;
  if (n * m > 4_000_000) {
    // Very long texts: fall back to "everything in the middle changed".
    for (let i = start; i < endA; i++) ops.push({ type: "del", a: i });
    for (let j = start; j < endB; j++) ops.push({ type: "add", b: j });
  } else if (n > 0 || m > 0) {
    const w = m + 1;
    const L = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        L[i * w + j] = a[start + i].word === b[start + j].word
          ? L[(i + 1) * w + j + 1] + 1
          : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[start + i].word === b[start + j].word) {
        ops.push({ type: "same", a: start + i, b: start + j }); i++; j++;
      } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) {
        ops.push({ type: "del", a: start + i }); i++;
      } else {
        ops.push({ type: "add", b: start + j }); j++;
      }
    }
    while (i < n) { ops.push({ type: "del", a: start + i }); i++; }
    while (j < m) { ops.push({ type: "add", b: start + j }); j++; }
  }

  for (let k = 0; endA + k < a.length; k++) ops.push({ type: "same", a: endA + k, b: endB + k });
  return ops;
}

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/**
 * Build HTML for both sides. Consecutive changed words are grouped into one
 * <del> / <ins> so a replaced phrase reads as one highlight, not many.
 */
export function renderDiff(beforeText, afterText) {
  const A = tokenize(beforeText);
  const B = tokenize(afterText);
  const ops = diffTokens(A.tokens, B.tokens);

  const side = (tokens, lead, keep, markType, tag, cls) => {
    let html = esc(lead);
    let open = false;
    let pendingWs = "";
    const words = [];
    for (const op of ops) {
      if (op.type !== "same" && op.type !== markType) continue;
      const tok = tokens[op[keep]];
      if (op.type === markType) {
        // Keep a highlight on one line: a line break closes the group.
        if (open && /\n/.test(pendingWs)) { html += `</${tag}>`; open = false; }
        if (!open) { html += esc(pendingWs) + `<${tag} class="${cls}">`; open = true; pendingWs = ""; }
        else { html += esc(pendingWs); pendingWs = ""; }
        html += esc(tok.word);
        words.push(tok.word);
        pendingWs = tok.ws;
      } else {
        if (open) { html += `</${tag}>`; open = false; }
        html += esc(pendingWs) + `<span class="same">${esc(tok.word)}</span>`;
        pendingWs = tok.ws;
      }
    }
    if (open) html += `</${tag}>`;
    html += esc(pendingWs);
    return { html, words };
  };

  const before = side(A.tokens, A.lead, "a", "del", "del", "rm");
  const after = side(B.tokens, B.lead, "b", "add", "ins", "add");
  return {
    beforeHtml: before.html,
    afterHtml: after.html,
    removed: before.words.length,
    added: after.words.length,
    kept: ops.filter((o) => o.type === "same").length,
  };
}

/** Reading time at an average 238 words a minute, as a short label. */
export function readingTime(words) {
  if (!words) return "0 s";
  const secs = Math.max(1, Math.round((words / 238) * 60));
  if (secs < 60) return `${secs} s`;
  const m = Math.floor(secs / 60), r = secs % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}
