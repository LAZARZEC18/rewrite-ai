// Rewrite: page logic. ES module; ZL (zl.js) is loaded in <head> before this runs.
import { TONES, CHANNELS, LENGTHS, MAX_TEXT, validate, parseVersions, splitSubject } from "./prompt.js";
import { renderDiff, countWords, readingTime } from "./diff.js";
import { TEMPLATES, matchTemplate, demoStream } from "./examples.js";
import { MODELS, ApiError, checkHealth, streamRewrite, looksLikeKey } from "./api.js";

const S = window.ZL.store;
const esc = window.ZL.esc;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const HISTORY_MAX = 20;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => n.toLocaleString("en-AU");

const CHANNEL_HINTS = {
  email: "Adds a subject line and sign-off.",
  text: "Short and easy to read on a phone.",
  slack: "Concise and easy to scan.",
  linkedin: "Warm and brief, no subject line.",
};
const MODE_COPY = {
  checking: { pill: "Checking", tip: "Checking the AI connection", title: "Checking the connection", text: "One moment." },
  hosted: { pill: "AI ready", tip: "Rewrites run on Rewrite's hosted AI", title: "Hosted AI is ready", text: "Rewrites run through Rewrite's own server, so you don't need a key. Fair use: 10 a minute, 60 a day." },
  byok: { pill: "Using your key", tip: "Rewrites use your Anthropic API key", title: "Using your API key", text: "Rewrites go straight from this browser to Anthropic and are billed to your account." },
  demo: { pill: "Demo mode", tip: "Plays pre-written samples of the templates", title: "Demo mode", text: "Hosted AI isn't available here, so Rewrite plays pre-written samples of the templates. Add your own key to rewrite anything." },
};

/* ------------------------------------------------------------ state */

const isRun = (r) => r && typeof r.input === "string" && Array.isArray(r.versions);
const prefs = Object.assign(
  { tone: "professional", channel: "email", audience: "", instruction: "", length: 0, variants: 3, diff: true },
  S.get("prefs", {})
);
if (!TONES[prefs.tone]) prefs.tone = "professional";
if (!CHANNELS[prefs.channel]) prefs.channel = "email";
let history = (S.get("history", []) || []).filter(isRun).slice(0, HISTORY_MAX);
let favs = (S.get("favs", []) || []).filter((f) => f && typeof f.body === "string");
let apiKey = String(S.get("apiKey", "") || "");
let model = S.get("model", MODELS[0].id);
if (!MODELS.some((m) => m.id === model)) model = MODELS[0].id;
let preferKey = !!S.get("preferKey", false);
let hostedState = "checking"; // checking | hosted | not-configured | unreachable
let run = null;
let active = 0;
let controller = null;
let libTab = "history";

function mode() {
  if (preferKey && apiKey) return "byok";
  if (hostedState === "hosted") return "hosted";
  if (apiKey) return "byok";
  if (hostedState === "checking") return "checking";
  return "demo";
}

const savePrefs = () => S.set("prefs", prefs);
const saveHistory = () => S.set("history", history);
const saveFavs = () => S.set("favs", favs);
const saveLastRun = () => {
  if (!run) { S.del("lastRun"); return; }
  const { id, at, input, tone, channel, audience, instruction, length, variants, mode: m, status, ms, versions, demo } = run;
  S.set("lastRun", { id, at, input, tone, channel, audience, instruction, length, variants, mode: m, status, ms, demo, versions: versions.map((v) => ({ subject: v.subject, body: v.body, done: true })) });
};

/* ------------------------------------------------------------ elements */

const el = {
  input: $("#input"), inputMeta: $("#inputMeta"), inputError: $("#inputError"), clearInput: $("#clearInput"),
  tones: $("#tones"), instruction: $("#instruction"), channel: $("#channel"), channelHint: $("#channelHint"),
  audience: $("#audience"), length: $("#length"), lengthLabel: $("#lengthLabel"), variants: $("#variants"),
  form: $("#composer"), go: $("#go"), goLabel: $("#goLabel"), stop: $("#stop"), kbdMod: $("#kbdMod"),
  modeDot: $("#modeDot"), modePill: $("#modePill"), barStatus: $("#barStatus"),
  outHead: $("#outHead"), tabs: $("#tabs"), favBtn: $("#favBtn"), useBtn: $("#useBtn"), copyBtn: $("#copyBtn"),
  note: $("#runNote"), noteText: $("#runNoteText"), noteBtn: $("#runNoteBtn"),
  err: $("#outError"), errTitle: $("#errTitle"), errHint: $("#errHint"), errAction: $("#errAction"),
  empty: $("#outEmpty"), emptyText: $("#outEmpty p"), emptyTpl: $("#emptyTemplates"),
  result: $("#result"), subject: $("#subject"), subjectText: $("#subjectText"), panes: $("#panes"),
  beforeText: $("#beforeText"), afterText: $("#afterText"), afterTitle: $("#afterTitle"),
  diffToggle: $("#diffToggle"), statWords: $("#statWords"), statRead: $("#statRead"), statChanges: $("#statChanges"),
  srStatus: $("#srStatus"),
  libTabs: $("#libTabs"), histCount: $("#histCount"), favCount: $("#favCount"), libSearch: $("#libSearch"),
  clearLib: $("#clearLib"), libList: $("#libList"), libEmpty: $("#libEmpty"),
  settingsBtn: $("#settingsBtn"), settingsDlg: $("#settingsDlg"), connState: $("#connState"), connTitle: $("#connTitle"),
  connText: $("#connText"), keyInput: $("#keyInput"), keyError: $("#keyError"), showKey: $("#showKey"),
  saved: $("#settingsSaved"), modelSel: $("#model"), preferKey: $("#preferKey"), saveKey: $("#saveKey"), forgetKey: $("#forgetKey"),
  templatesBtn: $("#templatesBtn"), templatesDlg: $("#templatesDlg"), templateList: $("#templateList"),
};

const ICON = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* ------------------------------------------------------------ composer */

function renderTones() {
  el.tones.innerHTML = Object.entries(TONES).map(([id, t]) =>
    `<button type="button" class="zl-chip" data-tone="${id}" aria-pressed="${id === prefs.tone}">${esc(t.label)}</button>`).join("");
}
function renderChannels() {
  el.channel.innerHTML = Object.entries(CHANNELS).map(([id, c]) =>
    `<button type="button" data-channel="${id}" aria-pressed="${id === prefs.channel}">${esc(c.label)}</button>`).join("");
  el.channelHint.textContent = CHANNEL_HINTS[prefs.channel];
}
function syncComposer() {
  $$("[data-tone]", el.tones).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tone === prefs.tone)));
  $$("[data-channel]", el.channel).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.channel === prefs.channel)));
  $$("[data-n]", el.variants).forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.n) === prefs.variants)));
  el.channelHint.textContent = CHANNEL_HINTS[prefs.channel];
  el.audience.value = prefs.audience;
  el.instruction.value = prefs.instruction;
  el.length.value = String(prefs.length);
  const ll = LENGTHS[String(prefs.length)].label;
  el.lengthLabel.textContent = ll;
  el.length.setAttribute("aria-valuetext", ll);
  el.length.style.setProperty("--fill", ((prefs.length + 2) / 4) * 100 + "%");
}

function updateMeta() {
  const text = el.input.value;
  const words = countWords(text);
  const over = text.length > MAX_TEXT;
  el.inputMeta.innerHTML = `<span>${fmt(words)} ${words === 1 ? "word" : "words"}</span><span class="${over ? "rw-over" : ""}">${fmt(text.length)} / ${fmt(MAX_TEXT)}</span>`;
  if (!el.inputError.hidden && text.trim() && !over) clearInputError();
}
function showInputError(msg) {
  el.inputError.textContent = msg;
  el.inputError.hidden = false;
  el.input.setAttribute("aria-invalid", "true");
}
function clearInputError() {
  el.inputError.hidden = true;
  el.input.removeAttribute("aria-invalid");
}

let draftTimer;
el.input.addEventListener("input", () => {
  updateMeta();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => S.set("draft", el.input.value), 250);
});
el.clearInput.addEventListener("click", () => {
  const prev = el.input.value;
  if (!prev) { el.input.focus(); return; }
  el.input.value = "";
  S.set("draft", "");
  updateMeta();
  el.input.focus();
  window.ZL.toast("Message cleared", { action: { label: "Undo", fn: () => { el.input.value = prev; S.set("draft", prev); updateMeta(); } } });
});
el.tones.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tone]"); if (!b) return;
  prefs.tone = b.dataset.tone; savePrefs(); syncComposer();
});
el.channel.addEventListener("click", (e) => {
  const b = e.target.closest("[data-channel]"); if (!b) return;
  prefs.channel = b.dataset.channel; savePrefs(); syncComposer();
});
el.variants.addEventListener("click", (e) => {
  const b = e.target.closest("[data-n]"); if (!b) return;
  prefs.variants = Number(b.dataset.n); savePrefs(); syncComposer();
});
el.length.addEventListener("input", () => { prefs.length = Number(el.length.value); savePrefs(); syncComposer(); });
el.audience.addEventListener("input", () => { prefs.audience = el.audience.value; savePrefs(); });
el.instruction.addEventListener("input", () => { prefs.instruction = el.instruction.value; savePrefs(); });

el.kbdMod.textContent = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

/* ------------------------------------------------------------ mode + settings */

function updateMode() {
  const m = mode();
  const c = MODE_COPY[m];
  el.modePill.textContent = c.pill;
  el.modePill.dataset.mode = m;
  el.modePill.setAttribute("data-tip", c.tip);
  el.modeDot.dataset.mode = m;
  el.connState.dataset.mode = m;
  el.connTitle.textContent = c.title;
  el.connText.textContent = m === "byok" && hostedState === "hosted" ? "You chose to use your own key. Rewrites go straight to Anthropic and are billed to your account." : c.text;
  el.forgetKey.hidden = !apiKey;
  el.emptyText.textContent = m === "demo"
    ? "Demo mode plays pre-written samples. Pick a situation to see it work, or add your key in Settings to rewrite anything."
    : "Write or paste a draft on the left, then press Rewrite. Or start from a real situation:";
}

el.modelSel.innerHTML = MODELS.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join("");

function openSettings() {
  el.keyInput.value = apiKey;
  el.keyInput.type = "password";
  el.showKey.textContent = "Show";
  el.showKey.setAttribute("aria-pressed", "false");
  el.keyError.hidden = true;
  el.keyInput.removeAttribute("aria-invalid");
  el.modelSel.value = model;
  el.preferKey.checked = preferKey;
  el.saved.textContent = "";
  updateMode();
  el.settingsDlg.showModal();
  if (!apiKey && mode() !== "hosted") el.keyInput.focus();
}
el.settingsBtn.addEventListener("click", openSettings);
el.showKey.addEventListener("click", () => {
  const show = el.keyInput.type === "password";
  el.keyInput.type = show ? "text" : "password";
  el.showKey.textContent = show ? "Hide" : "Show";
  el.showKey.setAttribute("aria-pressed", String(show));
});
function keyErr(msg) {
  el.keyError.textContent = msg; el.keyError.hidden = false;
  el.keyInput.setAttribute("aria-invalid", "true"); el.keyInput.focus();
}
el.keyInput.addEventListener("input", () => { el.keyError.hidden = true; el.keyInput.removeAttribute("aria-invalid"); });
el.keyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.saveKey.click(); } });
el.saveKey.addEventListener("click", () => {
  const k = el.keyInput.value.trim();
  if (!k) return keyErr("Paste your key first. It starts with sk-ant-.");
  if (!looksLikeKey(k)) return keyErr("That doesn't look like an Anthropic key. Keys start with sk-ant- and are about 100 characters long.");
  apiKey = k; S.set("apiKey", k);
  updateMode();
  el.settingsDlg.close();
  window.ZL.toast(mode() === "byok" ? "Key saved. Rewrites now use your key" : "Key saved. It's used if hosted AI is unavailable");
});
el.forgetKey.addEventListener("click", async () => {
  if (!apiKey) return;
  const ok = await window.ZL.confirm({
    title: "Forget your API key?",
    body: "It's removed from this browser. You'll need to paste it again to use it.",
    confirmLabel: "Forget key", danger: true,
  });
  if (!ok) return;
  apiKey = ""; S.del("apiKey"); el.keyInput.value = "";
  updateMode();
  saved("Key forgotten");
  window.ZL.toast("Key forgotten");
});
let savedTimer;
function saved(msg) {
  el.saved.innerHTML = ICON.check + esc(msg);
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { el.saved.textContent = ""; }, 2600);
}
el.modelSel.addEventListener("change", () => { model = el.modelSel.value; S.set("model", model); saved("Model saved"); });
el.preferKey.addEventListener("change", () => {
  preferKey = el.preferKey.checked; S.set("preferKey", preferKey); updateMode();
  saved(preferKey ? (apiKey ? "Using your key" : "Saved. Add a key to use it") : "Saved");
});

/* ------------------------------------------------------------ templates */

function renderTemplates() {
  el.templateList.innerHTML = TEMPLATES.map((t) => `
    <button type="button" class="rw-tpl" data-template="${t.id}">
      <b>${esc(t.title)}</b>
      <span class="rw-tpl-blurb">${esc(t.blurb)}</span>
      <span class="rw-tpl-meta"><span class="zl-badge">${esc(TONES[t.tone].label)}</span><span class="zl-badge rw-badge-plain">${esc(CHANNELS[t.channel].label)}</span></span>
    </button>`).join("");
  el.emptyTpl.innerHTML = TEMPLATES.slice(0, 4).map((t) =>
    `<button type="button" class="zl-chip" data-template="${t.id}">${esc(t.title)}</button>`).join("") +
    '<button type="button" class="zl-btn zl-btn-ghost zl-btn-sm" data-open-templates>All templates</button>';
}
function loadTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id); if (!t) return;
  const prevText = el.input.value;
  const prevPrefs = { ...prefs };
  el.input.value = t.input;
  Object.assign(prefs, { tone: t.tone, channel: t.channel, audience: t.audience, instruction: "", length: 0 });
  savePrefs(); syncComposer(); updateMeta(); S.set("draft", t.input);
  if (el.templatesDlg.open) el.templatesDlg.close();
  const undo = prevText.trim() && prevText !== t.input
    ? { label: "Undo", fn: () => { el.input.value = prevText; Object.assign(prefs, prevPrefs); savePrefs(); syncComposer(); updateMeta(); S.set("draft", prevText); } }
    : undefined;
  window.ZL.toast(`Loaded "${t.title}"`, undo ? { action: undo } : {});
  el.input.focus({ preventScroll: true });
  $("#inputField").scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
}
el.templatesBtn.addEventListener("click", () => el.templatesDlg.showModal());
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-template]");
  if (t) { loadTemplate(t.dataset.template); return; }
  if (e.target.closest("[data-open-templates]")) el.templatesDlg.showModal();
});

/* ------------------------------------------------------------ output */

const CARET = '<span class="rw-caret" aria-hidden="true"></span>';

function setBar(text) { el.barStatus.textContent = text; }
function announce(text) { el.srStatus.textContent = text; }

function diffFor(v) {
  if (!v._diff) v._diff = renderDiff(run.input, v.body);
  return v._diff;
}

function renderTabs() {
  const n = run.variants;
  const streaming = run.status === "streaming";
  el.tabs.innerHTML = Array.from({ length: n }, (_, i) => {
    const v = run.versions[i];
    const state = v && v.done ? "done" : v ? (streaming ? "writing" : "done") : streaming ? "waiting" : "empty";
    return `<button type="button" role="tab" id="tab-${i}" aria-selected="${i === active}" aria-controls="afterPane" tabindex="${i === active ? 0 : -1}" data-state="${state}" ${state === "empty" ? "disabled" : ""}>` +
      `<span class="rw-tab-dot" aria-hidden="true"></span>Version ${i + 1}</button>`;
  }).join("");
}

function renderActive() {
  if (!run) return;
  const v = run.versions[active];
  const streaming = run.status === "streaming";
  el.afterTitle.textContent = `Version ${active + 1}`;
  el.panes.dataset.diff = prefs.diff ? "on" : "off";
  const isFav = favs.some((f) => f.id === `${run.id}:${active}`);
  el.favBtn.setAttribute("aria-pressed", String(isFav));
  el.favBtn.setAttribute("data-tip", isFav ? "Remove from favourites" : "Save to favourites");
  el.favBtn.setAttribute("aria-label", isFav ? "Remove from favourites" : "Save to favourites");
  const ready = !!(v && v.done);
  [el.copyBtn, el.useBtn, el.favBtn].forEach((b) => { b.disabled = !ready; });

  if (!v) {
    el.subject.hidden = true;
    el.beforeText.textContent = run.input;
    el.afterText.innerHTML = !streaming ? '<span class="rw-wait">This version wasn\'t written.</span>'
      : active === 0 || !run.versions[active - 1]
        ? `<span class="rw-wait">${run.mode === "demo" ? "Starting the sample" : "Thinking it through"}${CARET}</span>`
        : `<span class="rw-wait">Version ${active + 1} starts when version ${active} is done${CARET}</span>`;
    el.afterText.setAttribute("aria-busy", String(streaming));
    setStats(null);
    return;
  }
  const showSubject = run.channel === "email" && (v.subject || !v.done);
  el.subject.hidden = !showSubject;
  el.subjectText.textContent = v.subject || "";
  el.afterText.setAttribute("aria-busy", String(!v.done));
  if (v.done && prefs.diff) {
    const d = diffFor(v);
    el.beforeText.innerHTML = d.beforeHtml;
    el.afterText.innerHTML = d.afterHtml;
  } else {
    el.beforeText.textContent = run.input;
    el.afterText.innerHTML = esc(v.body) + (v.done ? "" : CARET);
  }
  setStats(v);
}

function setStats(v) {
  const wb = countWords(run.input);
  if (!v) {
    el.statWords.innerHTML = `${fmt(wb)}`;
    el.statRead.textContent = readingTime(wb);
    el.statChanges.textContent = "–";
    return;
  }
  const wa = countWords(v.body);
  const arrow = '<span class="rw-to" aria-label="to">→</span>';
  el.statWords.innerHTML = `${fmt(wb)}${arrow}${fmt(wa)}`;
  el.statRead.innerHTML = `${readingTime(wb)}${arrow}${readingTime(wa)}`;
  if (v.done) {
    const d = diffFor(v);
    el.statChanges.innerHTML = `<span class="rw-plus">+${fmt(d.added)}</span> <span class="rw-minus">−${fmt(d.removed)}</span>`;
  } else {
    el.statChanges.textContent = "–";
  }
}

function showResultArea() {
  el.empty.hidden = true;
  el.outHead.hidden = false;
  el.result.hidden = false;
}
function showEmpty() {
  el.empty.hidden = false;
  el.outHead.hidden = true;
  el.result.hidden = true;
  el.note.hidden = true;
}
function hideError() { el.err.hidden = true; }
function showError(err, opts = {}) {
  el.errTitle.textContent = err.title || "Something went wrong.";
  el.errHint.textContent = err.hint || "";
  const action = opts.action || err.action;
  const labels = { settings: "Open settings", retry: "Try again", templates: "Browse templates" };
  el.errAction.hidden = !labels[action];
  el.errAction.textContent = labels[action] || "";
  el.errAction.dataset.action = action || "";
  el.err.hidden = false;
  el.err.classList.remove("rw-shake"); void el.err.offsetWidth; el.err.classList.add("rw-shake");
}
el.errAction.addEventListener("click", () => {
  const a = el.errAction.dataset.action;
  if (a === "settings") openSettings();
  else if (a === "retry") submit();
  else if (a === "templates") el.templatesDlg.showModal();
});

function showNote(text, btnLabel, fn) {
  el.noteText.textContent = text;
  el.noteBtn.hidden = !btnLabel;
  el.noteBtn.textContent = btnLabel || "";
  el.noteBtn.onclick = fn || null;
  el.note.hidden = false;
}

function updateFromRaw(full, finished) {
  run.raw = full;
  const parsed = parseVersions(full, finished).slice(0, run.variants);
  const prevCount = run.versions.length;
  run.versions = parsed.map((p, i) => {
    const old = run.versions[i];
    const next = { ...splitSubject(p.raw, run.channel), done: p.done };
    if (old && old._diff && old.body === next.body) next._diff = old._diff;
    return next;
  });
  const writing = run.versions.findIndex((v) => !v.done);
  if (run.status === "streaming") {
    setBar(writing === -1 ? "Finishing" : `Writing version ${writing + 1} of ${run.variants}`);
  }
  if (run.versions.length !== prevCount || parsed.some((p, i) => p.done && !(run._doneSeen || [])[i])) {
    run._doneSeen = parsed.map((p) => p.done);
    renderTabs();
  }
  renderActive();
}

function selectTab(i, focus) {
  if (!run || i < 0 || i >= run.variants) return;
  active = i;
  renderTabs();
  renderActive();
  if (focus) { const t = $(`#tab-${i}`); if (t) t.focus(); }
}
el.tabs.addEventListener("click", (e) => { const b = e.target.closest('[role="tab"]'); if (b && !b.disabled) selectTab(Number(b.id.slice(4))); });
el.tabs.addEventListener("keydown", (e) => {
  if (!run) return;
  const enabled = Array.from({ length: run.variants }, (_, i) => i).filter((i) => !$(`#tab-${i}`).disabled);
  const pos = enabled.indexOf(active);
  let next = null;
  if (e.key === "ArrowRight") next = enabled[(pos + 1) % enabled.length];
  else if (e.key === "ArrowLeft") next = enabled[(pos - 1 + enabled.length) % enabled.length];
  else if (e.key === "Home") next = enabled[0];
  else if (e.key === "End") next = enabled[enabled.length - 1];
  if (next != null) { e.preventDefault(); selectTab(next, true); }
});

el.diffToggle.checked = prefs.diff;
el.diffToggle.addEventListener("change", () => {
  prefs.diff = el.diffToggle.checked; savePrefs(); renderActive();
  window.ZL.toast(prefs.diff ? "Showing changes" : "Showing the clean version", { type: "info" });
});

/* ------------------------------------------------------------ running */

function setStreaming(on) {
  el.go.disabled = on;
  el.goLabel.textContent = on ? "Writing…" : "Rewrite";
  el.go.classList.toggle("is-busy", on);
  el.stop.hidden = !on;
  el.form.setAttribute("aria-busy", String(on));
}

async function playDemo(tpl, n, onText, signal) {
  const full = demoStream(tpl, n);
  if (reduceMotion()) { onText(full); return full; }
  await sleep(450);
  let i = 0;
  while (i < full.length) {
    if (signal.aborted) throw new ApiError("aborted", "Stopped.", "");
    i = Math.min(full.length, i + 4 + Math.floor(Math.random() * 6));
    onText(full.slice(0, i));
    await sleep(16);
  }
  return full;
}

let healthReady;

async function submit() {
  if (run && run.status === "streaming") return;
  const v = validate({
    text: el.input.value, tone: prefs.tone, channel: prefs.channel, audience: prefs.audience,
    instruction: prefs.instruction, variants: prefs.variants, length: prefs.length,
  });
  if (!v.ok) {
    if (v.field === "text") { showInputError(v.message); el.input.focus(); }
    else window.ZL.toast(v.message, { type: "bad" });
    return;
  }
  clearInputError();
  if (mode() === "checking") { setBar("Connecting"); await healthReady; }
  const m = mode();
  let tpl = null;
  if (m === "demo") {
    tpl = matchTemplate(v.value.text);
    if (!tpl) {
      if (!run) showEmpty();
      el.empty.hidden = true;
      showError(new ApiError("demo", "Demo mode can only rewrite the templates.",
        "Pick a template to watch a pre-written sample play, or add your Anthropic API key in Settings to rewrite your own message."), { action: "templates" });
      setBar("Demo mode");
      return;
    }
  }

  run = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...v.value, input: v.value.text, mode: m, status: "streaming", versions: [], demo: !!tpl };
  active = 0;
  hideError();
  el.note.hidden = true;
  showResultArea();
  renderTabs();
  renderActive();
  setStreaming(true);
  setBar(m === "demo" ? "Playing sample" : "Connecting");
  announce("Writing your rewrite");
  controller = new AbortController();
  const t0 = performance.now();
  const onText = (full) => updateFromRaw(full, false);

  try {
    let full, stopReason = "";
    if (m === "demo") full = await playDemo(tpl, v.value.variants, onText, controller.signal);
    else {
      const r = await streamRewrite({ mode: m, payload: v.value, apiKey, model, onText, signal: controller.signal });
      full = r.text; stopReason = r.stopReason;
    }
    updateFromRaw(full, true);
    if (!run.versions.some((x) => x.body.trim())) throw new ApiError("server", "The reply came back empty.", "Try again, or change the tone.", "retry");
    run.status = "done";
    run.ms = Math.round(performance.now() - t0);
    finishRun();
    const n = run.versions.length;
    const secs = (run.ms / 1000).toFixed(1);
    setBar(`${n} ${n === 1 ? "version" : "versions"} in ${secs} s`);
    announce(`${n} ${n === 1 ? "version" : "versions"} ready`);
    window.ZL.toast(`${n} ${n === 1 ? "version" : "versions"} ready`);
    if (stopReason === "max_tokens") {
      showNote("The reply hit its length limit, so the last version may be cut off. Ask for fewer versions or a shorter message.");
    } else if (m === "demo") {
      const off = tpl.tone !== run.tone || tpl.channel !== run.channel;
      showNote(off ? `Demo mode: this sample was written ahead of time for ${TONES[tpl.tone].label.toLowerCase()} ${CHANNELS[tpl.channel].label === "Text" ? "texts" : CHANNELS[tpl.channel].label}.` : "Demo mode: this sample was written ahead of time.", "Add your key", openSettings);
    }
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError("server", "Something went wrong.", "Try again.", "retry");
    if (e.kind === "aborted") {
      updateFromRaw(run.raw || "", true);
      run.versions = run.versions.filter((x) => x.body.trim());
      if (run.versions.length) {
        run.status = "stopped";
        run.variants = Math.max(run.versions.length, 1);
        active = Math.min(active, run.versions.length - 1);
        finishRun();
        setBar("Stopped");
        window.ZL.toast("Stopped. Kept what was written", { type: "info" });
      } else {
        run = null; S.del("lastRun"); showEmpty();
        setBar("Stopped");
        window.ZL.toast("Stopped", { type: "info" });
      }
    } else {
      if (e.kind === "not-configured") { hostedState = "not-configured"; updateMode(); }
      const kept = run.versions.filter((x) => x.done && x.body.trim());
      if (kept.length) {
        run.versions = kept; run.variants = kept.length; run.status = "stopped"; active = 0;
        finishRun();
      } else {
        run = null;
        el.outHead.hidden = true; el.result.hidden = true; el.empty.hidden = true;
      }
      showError(e);
      setBar(e.kind === "rate" ? "Rate limited" : "Couldn't rewrite");
      announce(e.title);
    }
  } finally {
    controller = null;
    setStreaming(false);
  }
}

function finishRun() {
  run.versions.forEach((x) => { x.done = true; });
  renderTabs();
  renderActive();
  history = [stripRun(run), ...history.filter((h) => h.id !== run.id)].slice(0, HISTORY_MAX);
  saveHistory();
  saveLastRun();
  renderLibrary();
}
function stripRun(r) {
  return { id: r.id, at: r.at, input: r.input, tone: r.tone, channel: r.channel, audience: r.audience, instruction: r.instruction, length: r.length, variants: r.variants, mode: r.mode, demo: r.demo, versions: r.versions.map((v) => ({ subject: v.subject, body: v.body })) };
}

el.form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
el.stop.addEventListener("click", () => { if (controller) controller.abort(); });
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    if (document.querySelector("dialog[open]")) return;
    e.preventDefault();
    submit();
  } else if (e.key === "Escape" && controller && !document.querySelector("dialog[open]")) {
    controller.abort();
  }
});

/* ------------------------------------------------------------ per-version actions */

function activeVersion() { return run && run.versions[active] && run.versions[active].done ? run.versions[active] : null; }
const fullText = (v) => (v.subject ? `Subject: ${v.subject}\n\n${v.body}` : v.body);

function flash(btn, html) {
  const orig = btn.innerHTML;
  btn.innerHTML = html;
  btn.classList.add("rw-flash");
  setTimeout(() => { btn.innerHTML = orig; btn.classList.remove("rw-flash"); }, 1400);
}
async function copyText(text, btn) {
  const ok = await window.ZL.copy(text);
  if (ok) {
    window.ZL.toast("Copied to clipboard");
    if (btn) flash(btn, ICON.check + "Copied");
  } else {
    window.ZL.toast("Couldn't copy. Select the text and copy it manually", { type: "bad" });
  }
}
el.copyBtn.addEventListener("click", () => { const v = activeVersion(); if (v) copyText(fullText(v), el.copyBtn); });
el.useBtn.addEventListener("click", () => {
  const v = activeVersion(); if (!v) return;
  const prev = el.input.value;
  el.input.value = v.body;
  S.set("draft", v.body);
  updateMeta();
  $("#inputField").scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
  el.input.focus({ preventScroll: true });
  el.input.classList.remove("rw-pulse"); void el.input.offsetWidth; el.input.classList.add("rw-pulse");
  window.ZL.toast(`Version ${active + 1} is now your message. Pick a tone and go again`, { action: { label: "Undo", fn: () => { el.input.value = prev; S.set("draft", prev); updateMeta(); } } });
});
el.favBtn.addEventListener("click", () => {
  const v = activeVersion(); if (!v) return;
  const id = `${run.id}:${active}`;
  const idx = favs.findIndex((f) => f.id === id);
  if (idx >= 0) {
    const [removed] = favs.splice(idx, 1);
    saveFavs(); renderActive(); renderLibrary();
    window.ZL.toast("Removed from favourites", { action: { label: "Undo", fn: () => { favs.splice(idx, 0, removed); saveFavs(); renderActive(); renderLibrary(); } } });
  } else {
    favs.unshift({ id, at: Date.now(), subject: v.subject, body: v.body, tone: run.tone, channel: run.channel, audience: run.audience, input: run.input });
    saveFavs(); renderActive(); renderLibrary();
    el.favBtn.classList.remove("rw-pop"); void el.favBtn.offsetWidth; el.favBtn.classList.add("rw-pop");
    window.ZL.toast("Saved to favourites");
  }
});

/* ------------------------------------------------------------ library */

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172800) return "Yesterday";
  return new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
const firstLine = (s) => (s || "").replace(/\s+/g, " ").trim();

function renderLibrary() {
  el.histCount.textContent = history.length;
  el.favCount.textContent = favs.length;
  $$("[data-lib]", el.libTabs).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.lib === libTab)));
  el.libList.setAttribute("aria-labelledby", `libTab-${libTab}`);
  const q = el.libSearch.value.trim().toLowerCase();
  const source = libTab === "history" ? history : favs;
  const hay = (x) => libTab === "history"
    ? [x.input, x.audience, x.instruction, TONES[x.tone] && TONES[x.tone].label, ...x.versions.map((v) => v.subject + " " + v.body)].join(" ").toLowerCase()
    : [x.subject, x.body, x.input, x.audience, TONES[x.tone] && TONES[x.tone].label].join(" ").toLowerCase();
  const items = q ? source.filter((x) => hay(x).includes(q)) : source;
  el.clearLib.hidden = !source.length;
  el.clearLib.textContent = libTab === "history" ? "Clear history" : "Clear favourites";

  if (!items.length) {
    el.libList.innerHTML = "";
    el.libEmpty.hidden = false;
    const t = $("#libEmptyTitle"), p = $("#libEmptyText");
    const old = el.libEmpty.querySelector(".zl-btn"); if (old) old.remove();
    let btn = "";
    if (q) { t.textContent = `No matches for "${el.libSearch.value.trim()}"`; p.textContent = "Try another word, or clear the search."; btn = '<button type="button" class="zl-btn zl-btn-secondary zl-btn-sm" data-clear-search>Clear search</button>'; }
    else if (libTab === "history") { t.textContent = "No rewrites yet"; p.textContent = "Your last 20 rewrites are kept here, on this device only."; btn = '<button type="button" class="zl-btn zl-btn-secondary zl-btn-sm" data-open-templates>Try a template</button>'; }
    else { t.textContent = "No favourites yet"; p.textContent = "Press the thumbs-up on a version you like and it's saved here."; }
    if (btn) p.insertAdjacentHTML("afterend", btn);
    return;
  }
  el.libEmpty.hidden = true;
  el.libList.innerHTML = items.map((x) => libTab === "history" ? historyItem(x) : favItem(x)).join("");
}

function badges(x) {
  return `<span class="zl-badge">${esc((TONES[x.tone] || TONES.professional).label)}</span><span class="zl-badge rw-badge-plain">${esc((CHANNELS[x.channel] || CHANNELS.email).label)}</span>`;
}
function historyItem(h) {
  const v = h.versions[0] || { subject: "", body: "" };
  return `<li class="rw-item" data-id="${esc(h.id)}">
    <div class="rw-item-top">${badges(h)}<span class="rw-item-time">${esc(ago(h.at))}</span></div>
    <p class="rw-item-in">${esc(firstLine(h.input))}</p>
    <p class="rw-item-out">${esc(firstLine(v.subject ? v.subject + ". " + v.body : v.body))}</p>
    <div class="rw-item-foot"><span class="zl-hint">${h.versions.length} ${h.versions.length === 1 ? "version" : "versions"}</span>
      <span class="rw-item-actions">
        <button type="button" class="zl-btn zl-btn-ghost zl-btn-sm rw-icon-btn" data-del-history="${esc(h.id)}" aria-label="Delete this rewrite" data-tip="Delete">${ICON.trash}</button>
        <button type="button" class="zl-btn zl-btn-secondary zl-btn-sm" data-open-history="${esc(h.id)}">Open</button>
      </span></div>
  </li>`;
}
function favItem(f) {
  return `<li class="rw-item rw-fav" data-id="${esc(f.id)}">
    <div class="rw-item-top">${badges(f)}<span class="rw-item-time">${esc(ago(f.at))}</span></div>
    ${f.subject ? `<p class="rw-item-subject">${esc(f.subject)}</p>` : ""}
    <p class="rw-item-out rw-item-body">${esc(f.body)}</p>
    <div class="rw-item-foot"><span></span>
      <span class="rw-item-actions">
        <button type="button" class="zl-btn zl-btn-ghost zl-btn-sm rw-icon-btn" data-del-fav="${esc(f.id)}" aria-label="Remove from favourites" data-tip="Remove">${ICON.trash}</button>
        <button type="button" class="zl-btn zl-btn-secondary zl-btn-sm" data-copy-fav="${esc(f.id)}">${ICON.copy}Copy</button>
      </span></div>
  </li>`;
}

el.libTabs.addEventListener("click", (e) => { const b = e.target.closest("[data-lib]"); if (!b) return; libTab = b.dataset.lib; S.set("libTab", libTab); renderLibrary(); });
el.libTabs.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  libTab = libTab === "history" ? "favs" : "history"; S.set("libTab", libTab); renderLibrary();
  $(`#libTab-${libTab}`).focus();
});
el.libSearch.addEventListener("input", renderLibrary);
el.libList.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open-history]");
  const del = e.target.closest("[data-del-history]");
  const copyF = e.target.closest("[data-copy-fav]");
  const delF = e.target.closest("[data-del-fav]");
  if (open) openHistory(open.dataset.openHistory);
  else if (del) {
    const idx = history.findIndex((h) => h.id === del.dataset.delHistory); if (idx < 0) return;
    const [removed] = history.splice(idx, 1); saveHistory(); renderLibrary();
    window.ZL.toast("Rewrite deleted", { action: { label: "Undo", fn: () => { history.splice(idx, 0, removed); saveHistory(); renderLibrary(); } } });
  } else if (copyF) {
    const f = favs.find((x) => x.id === copyF.dataset.copyFav); if (f) copyText(fullText(f), copyF);
  } else if (delF) {
    const idx = favs.findIndex((x) => x.id === delF.dataset.delFav); if (idx < 0) return;
    const [removed] = favs.splice(idx, 1); saveFavs(); renderLibrary(); if (run) renderActive();
    window.ZL.toast("Removed from favourites", { action: { label: "Undo", fn: () => { favs.splice(idx, 0, removed); saveFavs(); renderLibrary(); if (run) renderActive(); } } });
  }
});
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-clear-search]")) { el.libSearch.value = ""; renderLibrary(); el.libSearch.focus(); }
});
el.clearLib.addEventListener("click", async () => {
  const isHist = libTab === "history";
  const n = isHist ? history.length : favs.length;
  const ok = await window.ZL.confirm({
    title: isHist ? "Clear your history?" : "Clear your favourites?",
    body: `This removes ${n} ${isHist ? (n === 1 ? "rewrite" : "rewrites") : (n === 1 ? "favourite" : "favourites")} from this device. It can't be undone.`,
    confirmLabel: isHist ? "Clear history" : "Clear favourites", danger: true,
  });
  if (!ok) return;
  if (isHist) { history = []; saveHistory(); } else { favs = []; saveFavs(); if (run) renderActive(); }
  renderLibrary();
  window.ZL.toast(isHist ? "History cleared" : "Favourites cleared");
});

function openHistory(id) {
  const h = history.find((x) => x.id === id); if (!h) return;
  if (run && run.status === "streaming") { window.ZL.toast("Wait for this rewrite to finish, or press Stop", { type: "info" }); return; }
  run = { ...h, status: "done", versions: h.versions.map((v) => ({ ...v, done: true })) };
  run.variants = run.versions.length;
  active = 0;
  el.input.value = h.input; S.set("draft", h.input); updateMeta();
  Object.assign(prefs, { tone: h.tone, channel: h.channel, audience: h.audience || "", instruction: h.instruction || "", length: h.length || 0, variants: Math.max(1, Math.min(3, h.versions.length)) });
  savePrefs(); syncComposer();
  hideError(); el.note.hidden = true;
  showResultArea(); renderTabs(); renderActive(); saveLastRun();
  setBar(`Opened from ${ago(h.at).toLowerCase()}`);
  $("#output").scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
  window.ZL.toast("Opened from history");
}

/* ------------------------------------------------------------ init */

renderTones();
renderChannels();
syncComposer();
renderTemplates();
el.input.value = S.get("draft", "") || "";
updateMeta();
libTab = S.get("libTab", "history") === "favs" ? "favs" : "history";
renderLibrary();

const last = S.get("lastRun", null);
if (isRun(last) && last.versions.length) {
  run = { ...last, status: "done", versions: last.versions.map((v) => ({ ...v, done: true })) };
  run.variants = run.versions.length;
  showResultArea(); renderTabs(); renderActive();
  setBar(`Last rewrite, ${ago(run.at).toLowerCase()}`);
} else {
  showEmpty();
}
updateMode();

healthReady = checkHealth().then((s) => {
  hostedState = s;
  updateMode();
  if (!run || run.status !== "streaming") setBar(isRun(last) && run ? el.barStatus.textContent : "Ready");
});

window.ZL.tour([
  { el: "#inputField", title: "Paste your draft", body: "Rough is fine. Typos, missing capitals and run-on sentences all get fixed. Templates has eight real situations to start from." },
  { el: "#tones", title: "Pick a tone", body: "Eight presets, from professional to a polite no. Add your own instruction underneath if you need something specific." },
  { el: "#channelAudience", title: "Say where it's going", body: "Email adds a subject line. Texts stay short. Tell it who's reading so the formality fits." },
  { el: ".rw-actions", title: "Rewrite", body: "Press Rewrite, or Ctrl or ⌘ with Enter. Up to three versions stream in as they're written." },
  { el: "#output", title: "Compare and copy", body: "Switch versions in the tabs. Highlight changes shows every word that was cut or added. Copy it, save it, or feed it back in." },
  { el: "#library", title: "History and favourites", body: "Your last 20 rewrites and the versions you liked are kept on this device, with search." },
]);
