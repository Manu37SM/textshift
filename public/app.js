// TextShift frontend — vanilla JS, no build step, no framework.
(() => {
  "use strict";

  const T = window.TextLib;
  const MAX_CHARS = 6000; // mirrors the server default (MAX_INPUT_CHARS)
  const API = { detect: "/api/detect", compare: "/api/compare" };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- AI tool definitions (panels are generated from this) ----------
  const LANGS = [
    ["en", "English"], ["hi", "Hindi"], ["mr", "Marathi"], ["gu", "Gujarati"], ["ta", "Tamil"], ["te", "Telugu"],
    ["bn", "Bengali"], ["kn", "Kannada"], ["ml", "Malayalam"], ["pa", "Punjabi"], ["ur", "Urdu"], ["es", "Spanish"],
    ["fr", "French"], ["de", "German"], ["pt", "Portuguese"], ["it", "Italian"], ["ar", "Arabic"],
    ["ja", "Japanese"], ["zh", "Chinese (Simplified)"], ["ko", "Korean"], ["ru", "Russian"],
  ];
  const sel = (key, label, options, value) => ({ type: "select", key, label, options, value });
  const chk = (key, label, checked = false) => ({ type: "check", key, label, checked });

  const AI_TOOLS = [
    {
      id: "ai-human", name: "AI → Human", endpoint: "/api/humanize", button: "Humanize", pair: true, lang: true,
      inLabel: "Input · AI-generated text", outLabel: "Output · Humanized",
      inPh: "Paste AI-generated or AI-assisted text here…", outPh: "Your humanized text will appear here…",
      opts: [
        sel("style", "Style", [["natural", "Natural"], ["casual", "Casual"], ["professional", "Professional"], ["academic", "Academic"], ["technical", "Technical"], ["friendly", "Friendly"]]),
        sel("level", "Humanization", [["light", "Light"], ["medium", "Medium"], ["strong", "Strong"]], "medium"),
        chk("preserveLength", "Preserve length"),
        chk("preserveTerminology", "Preserve terminology", true),
      ],
    },
    {
      id: "human-ai", name: "Human → AI", endpoint: "/api/aiify", button: "Structure", pair: true,
      inLabel: "Input · Human-written text", outLabel: "Output · AI-style",
      inPh: "Paste naturally written human text here…", outPh: "Your structured text will appear here…",
      opts: [
        sel("style", "Style", [["general", "General"], ["professional", "Professional"], ["academic", "Academic"], ["technical", "Technical"], ["business", "Business"], ["structured", "Structured"]]),
        sel("structureLevel", "Structure", [["light", "Light"], ["medium", "Medium"], ["strong", "Strong"]], "medium"),
        chk("preserveLength", "Preserve length"),
      ],
    },
    {
      id: "paraphrase", name: "Paraphrase", endpoint: "/api/paraphrase", button: "Paraphrase", pair: true,
      inLabel: "Original text", outLabel: "Paraphrased",
      inPh: "Paste text to reword…", outPh: "The reworded text will appear here…",
      opts: [
        sel("mode", "Mode", [["standard", "Standard"], ["fluency", "Fluency"], ["formal", "Formal"], ["casual", "Casual"], ["simple", "Simple"], ["creative", "Creative"], ["expand", "Expand"], ["shorten", "Shorten"]]),
        chk("preserveTerminology", "Preserve terminology", true),
      ],
    },
    {
      id: "grammar", name: "Grammar", endpoint: "/api/grammar", button: "Fix grammar", pair: true, autoDiff: true,
      inLabel: "Text to check", outLabel: "Corrected",
      inPh: "Paste text to proofread…", outPh: "The corrected text will appear here. Use “Show changes” to see every edit.",
      opts: [
        sel("mode", "Mode", [["proofread", "Proofread (errors only)"], ["polish", "Polish (errors + clarity)"]]),
        sel("dialect", "English", [["us", "American"], ["uk", "British"], ["in", "Indian"]]),
      ],
    },
    {
      id: "summarize", name: "Summarize", endpoint: "/api/summarize", button: "Summarize",
      inLabel: "Text to summarize", outLabel: "Summary",
      inPh: "Paste an article, email thread, notes or report…", outPh: "The summary will appear here…",
      opts: [
        sel("format", "Format", [["bullets", "Bullet points"], ["tldr", "TL;DR"], ["paragraph", "Paragraph"], ["actions", "Key points + action items"], ["simple", "Explain simply"]]),
        sel("length", "Length", [["short", "Short"], ["medium", "Medium"], ["long", "Long"]], "medium"),
      ],
    },
    {
      id: "translate", name: "Translate", endpoint: "/api/translate", button: "Translate",
      inLabel: "Text (language auto-detected)", outLabel: "Translation",
      inPh: "Paste text in any language…", outPh: "The translation will appear here…",
      opts: [
        sel("target", "Translate to", LANGS, "hi"),
        sel("tone", "Tone", [["neutral", "Neutral"], ["formal", "Formal"], ["casual", "Casual"]]),
      ],
    },
  ];
  const OTHER_DESTS = [["auto", "Auto"], ["pipeline", "Pipeline"], ["tone", "Tone"], ["detector", "Detector"], ["compare", "Compare"], ["stats", "Stats"], ["cleaner", "Cleaner"]];

  // ---------- helpers ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const fmtCounts = (text) => {
    const s = T.words(text).length;
    return `${s} words · ${Array.from(text).length} chars`;
  };
  const fmtMin = (m) => (m < 1 ? `${Math.max(1, Math.round(m * 60))} sec` : `${m} min`);
  function updateCounts(panel, role, textarea) {
    const el = $(`.counts[data-count-for="${role}"]`, panel);
    if (el) el.textContent = fmtCounts(textarea.value);
  }
  function setStatus(panel, kind, message) {
    const row = $('[data-role="status"]', panel);
    if (!row) return;
    row.innerHTML = message ? `<span class="${kind}">${escapeHtml(message)}</span>` : "";
  }
  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }
  /** Set a textarea value, respecting its maxlength (programmatic sets bypass it). */
  function setValue(el, value) {
    let v = value;
    if (el.maxLength > 0 && v.length > el.maxLength) {
      v = v.slice(0, el.maxLength);
      toast(`Trimmed to ${el.maxLength} characters (limit for AI tools).`);
    }
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("Copied to clipboard");
  }
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function postJson(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch { /* handled below */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (HTTP ${res.status}).`);
    return data;
  }
  function withLoading(panel, fn) {
    return async (...args) => {
      const buttons = $$("button", panel);
      buttons.forEach((b) => (b.disabled = true));
      panel.setAttribute("aria-busy", "true");
      setStatus(panel, "loading", "Working");
      try {
        await fn(...args);
        setStatus(panel, "", "");
      } catch (err) {
        setStatus(panel, "error", err.message || "Something went wrong.");
      } finally {
        buttons.forEach((b) => (b.disabled = false));
        panel.removeAttribute("aria-busy");
      }
    };
  }
  function renderDiff(el, a, b) {
    const ops = T.diffWords(a, b);
    const sum = T.diffSummary(ops);
    el.textContent = "";
    const head = document.createElement("div");
    head.className = "diff-summary";
    head.textContent = `${sum.added} words added · ${sum.removed} removed · ${sum.kept} kept (about ${sum.changedPct}% changed)`;
    const body = document.createElement("div");
    body.className = "diff-body";
    for (const op of ops) {
      if (op.type === "eq") body.append(document.createTextNode(op.text));
      else {
        const n = document.createElement(op.type === "ins" ? "ins" : "del");
        n.textContent = op.text;
        body.append(n);
      }
    }
    el.append(head, body);
  }
  function wireUpload(panel) {
    $$('input[data-action="upload"]', panel).forEach((inp) => {
      inp.addEventListener("change", async () => {
        const file = inp.files && inp.files[0];
        inp.value = "";
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return toast("File is too large (2 MB max).");
        const target = $('[data-role="input"]', panel) || $('[data-role="original"]', panel);
        setValue(target, await file.text());
      });
    });
  }

  // ---------- theme ----------
  const root = document.documentElement;
  const sunIcon = $("#theme-icon-sun");
  const moonIcon = $("#theme-icon-moon");
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    sunIcon.style.display = theme === "dark" ? "none" : "block";
    moonIcon.style.display = theme === "dark" ? "block" : "none";
    try { localStorage.setItem("textshift-theme", theme); } catch { /* storage may be unavailable */ }
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem("textshift-theme"); } catch { /* ignore */ }
  applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#theme-toggle").addEventListener("click", () => applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));

  // ---------- shared state ----------
  let lastTransformation = null; // { original, result } from the most recent rewrite

  // ---------- history (localStorage only) ----------
  const HISTORY_KEY = "textshift-history-v1";
  const HISTORY_MAX = 25;
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* quota or disabled */ }
  }
  function pushHistory(entry) {
    saveHistory([{ ...entry, ts: Date.now() }, ...loadHistory()].slice(0, HISTORY_MAX));
  }
  const historyDialog = $("#history-dialog");
  function renderHistory() {
    const list = loadHistory();
    const ul = $("#history-list");
    ul.innerHTML = list.length
      ? list.map((h, i) => `<li>
          <div class="h-meta"><strong>${escapeHtml(h.label)}</strong> · ${new Date(h.ts).toLocaleString()}</div>
          <div class="h-snip">${escapeHtml(h.input.slice(0, 90))}${h.input.length > 90 ? "…" : ""}</div>
          <div class="h-actions"><button class="btn ghost small" data-h-restore="${i}">Restore</button><button class="btn ghost small" data-h-del="${i}">Delete</button></div>
        </li>`).join("")
      : '<li class="empty-hint">Nothing yet. Results from the AI tools show up here.</li>';
  }
  $("#history-btn").addEventListener("click", () => { renderHistory(); historyDialog.showModal(); });
  $("#history-close").addEventListener("click", () => historyDialog.close());
  historyDialog.addEventListener("click", (e) => { if (e.target === historyDialog) historyDialog.close(); });
  $("#history-clear").addEventListener("click", () => { saveHistory([]); renderHistory(); });
  $("#history-list").addEventListener("click", (e) => {
    const list = loadHistory();
    const r = e.target.closest("[data-h-restore]");
    const d = e.target.closest("[data-h-del]");
    if (r) {
      const h = list[Number(r.dataset.hRestore)];
      if (!h) return;
      showTab(h.tool);
      const panel = $(`#panel-${h.tool}`);
      setValue($('[data-role="input"]', panel), h.input);
      const out = $('[data-role="output"]', panel);
      if (out) setValue(out, h.output);
      const ow = $('[data-role="auto-output"]', panel);
      if (ow && h.output) ow.hidden = false;
      historyDialog.close();
    } else if (d) {
      list.splice(Number(d.dataset.hDel), 1);
      saveHistory(list);
      renderHistory();
    }
  });

  // ---------- tabs ----------
  const tabs = $$(".tab");
  function showTab(id, { updateHash = true } = {}) {
    const tab = tabs.find((t) => t.dataset.tab === id) || tabs[0];
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab.dataset.tab}`));
    tab.scrollIntoView({ inline: "nearest", block: "nearest" });
    if (updateHash) history.replaceState(null, "", `#${tab.dataset.tab}`);
  }
  tabs.forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));


  // ---------- language handling (detect badge, translate-first / pivot) ----------
  const LANG_NAME = Object.fromEntries(LANGS);
  const TRANSLATABLE = new Set(LANGS.map(([c]) => c));
  const clip = (str) => (str.length > MAX_CHARS ? str.slice(0, MAX_CHARS) : str);

  /** Injects the language bar above the editors; returns accessors. kind: "detect" | "pivot". */
  function wireLangBar(panel, input, { kind }) {
    const modes = kind === "detect"
      ? [["keep", "Analyze in the original language"], ["english", "Translate to English first, then analyze"]]
      : [["keep", "Keep the original language"], ["pivot", "Translate to English → process → translate back"]];
    const bar = document.createElement("div");
    bar.className = "lang-bar";
    bar.innerHTML = `
      <span class="lang-badge" data-role="lang-badge" aria-live="polite">Language: —</span>
      <label>Input language <select data-lang="source"><option value="auto">Auto-detect</option>${LANGS.map(([c, n]) => `<option value="${c}">${escapeHtml(n)}</option>`).join("")}</select></label>
      <label>Handling <select data-lang="mode">${modes.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join("")}</select></label>
      <span class="lang-note muted small" data-role="lang-note"></span>`;
    panel.insertBefore(bar, $(".editor-grid", panel));
    const srcSel = $('[data-lang="source"]', bar), modeSel = $('[data-lang="mode"]', bar);
    const badge = $('[data-role="lang-badge"]', bar), note = $('[data-role="lang-note"]', bar);

    function effective() {
      if (srcSel.value !== "auto") return { code: srcSel.value, name: LANG_NAME[srcSel.value], manual: true, isEnglish: srcSel.value === "en", confidence: "high" };
      return { ...T.detectLanguage(input.value), manual: false };
    }
    function update() {
      if (!input.value.trim()) { badge.textContent = "Language: —"; note.textContent = ""; badge.className = "lang-badge"; return; }
      const l = effective();
      badge.textContent = l.manual ? `Language: ${l.name}` : l.code === "und" ? "Language: unknown" : `Detected: ${l.name}${l.confidence === "low" ? " (unsure)" : ""}`;
      badge.className = "lang-badge" + (l.isEnglish ? "" : " foreign");
      if (l.isEnglish) note.textContent = "English: no translation needed.";
      else if (modeSel.value === "keep") note.textContent = kind === "detect"
        ? "Analyzed in the original language. English-only local signals are skipped and AI confidence is usually lower."
        : "The result stays in the original language.";
      else note.textContent = kind === "detect" ? "Uses 1 extra AI request. Translation smooths style, so the score is less reliable."
        : "Uses 2 extra AI requests. Back-translation can flatten the style a little.";
    }
    let timer;
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 200); });
    srcSel.addEventListener("change", update);
    modeSel.addEventListener("change", update);
    return { effective, mode: () => modeSel.value, update, kind };
  }

  /** Decide whether to translate. Throws a helpful Error when the choice can't work. */
  function langPlan(lb) {
    const lang = lb.effective();
    if (lb.mode() === "keep" || lang.isEnglish) return { translate: false, lang };
    if (lang.code === "und" || (!lang.manual && lang.confidence === "low")) {
      throw new Error("Couldn't tell which language this is. Pick it under “Input language”, or set Handling to keep the original language.");
    }
    if (lb.kind === "pivot" && !TRANSLATABLE.has(lang.code)) {
      throw new Error(`Translating back to ${lang.name} isn't supported. Use “Keep the original language” for this text.`);
    }
    return { translate: true, lang };
  }

  /** Runs `endpoint` on the text, optionally via English. onStep(k) fires before each AI call (k = 0,1,2). */
  async function runPivot(plan, endpoint, payload, onStep = () => {}) {
    if (!plan.translate) { onStep(0); return postJson(endpoint, payload); }
    onStep(0);
    const en = await postJson("/api/translate", { text: clip(payload.text), target: "en", tone: "neutral" });
    onStep(1);
    const done = await postJson(endpoint, { ...payload, text: clip(en.result) });
    onStep(2);
    const back = await postJson("/api/translate", { text: clip(done.result), target: plan.lang.code, tone: "neutral" });
    return { ...back, via: en.result };
  }

  // ---------- generated AI panels ----------
  function optHtml(o) {
    if (o.type === "select") {
      return `<label>${escapeHtml(o.label)}<select data-opt="${o.key}">${o.options
        .map(([v, l]) => `<option value="${v}"${v === o.value ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select></label>`;
    }
    return `<label class="checkbox"><input type="checkbox" data-opt="${o.key}"${o.checked ? " checked" : ""} /> ${escapeHtml(o.label)}</label>`;
  }

  function buildAiPanel(tool) {
    const dests = [...AI_TOOLS.filter((t) => t.id !== tool.id).map((t) => [t.id, t.name]), ...OTHER_DESTS];
    const section = document.createElement("section");
    section.className = "panel";
    section.id = `panel-${tool.id}`;
    section.setAttribute("role", "tabpanel");
    section.innerHTML = `
      <div class="options-bar">${tool.opts.map(optHtml).join("")}</div>
      <div class="editor-grid">
        <div class="editor-col">
          <div class="editor-head"><span>${escapeHtml(tool.inLabel)}</span><span class="counts" data-count-for="input">0 words · 0 chars</span></div>
          <textarea class="editor" data-role="input" placeholder="${escapeHtml(tool.inPh)}" maxlength="${MAX_CHARS}"></textarea>
          <div class="editor-actions">
            <button class="btn primary" data-action="run">${escapeHtml(tool.button)}</button>
            <button class="btn ghost" data-action="clear">Clear</button>
            <label class="file-btn btn ghost">Open file<input type="file" accept=".txt,.md,.text,text/plain" data-action="upload" hidden /></label>
          </div>
        </div>
        <div class="editor-col">
          <div class="editor-head"><span>${escapeHtml(tool.outLabel)}</span><span class="counts" data-count-for="output">0 words · 0 chars</span></div>
          <textarea class="editor" data-role="output" placeholder="${escapeHtml(tool.outPh)}" readonly></textarea>
          <div class="editor-actions">
            <button class="btn ghost" data-action="copy">Copy</button>
            <button class="btn ghost" data-action="download">Download</button>
            <button class="btn ghost" data-action="diff" aria-pressed="false">Show changes</button>
            <select class="sendto" data-role="sendto" aria-label="Send output to another tool">
              <option value="">Send to…</option>${dests.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      <div class="diff-view" data-role="diff-view" hidden></div>
      <div class="status-row" data-role="status" aria-live="polite"></div>`;
    return section;
  }

  function wireAiPanel(tool, panel) {
    const input = $('[data-role="input"]', panel);
    const output = $('[data-role="output"]', panel);
    const diffView = $('[data-role="diff-view"]', panel);
    const diffBtn = $('[data-action="diff"]', panel);
    let diffOn = false;

    const refreshDiff = () => {
      diffView.hidden = !(diffOn && output.value);
      diffBtn.setAttribute("aria-pressed", String(diffOn));
      diffBtn.textContent = diffOn ? "Hide changes" : "Show changes";
      if (!diffView.hidden) renderDiff(diffView, input.value.trim(), output.value);
    };

    updateCounts(panel, "input", input);
    updateCounts(panel, "output", output);
    input.addEventListener("input", () => updateCounts(panel, "input", input));
    output.addEventListener("input", () => updateCounts(panel, "output", output));
    wireUpload(panel);
    const lb = tool.lang ? wireLangBar(panel, input, { kind: "pivot" }) : null;

    $('[data-action="run"]', panel).addEventListener("click", withLoading(panel, async () => {
      const text = input.value.trim();
      if (!text) throw new Error("Enter some text first.");
      const plan = lb ? langPlan(lb) : null;
      const payload = { text };
      $$("[data-opt]", panel).forEach((el) => {
        payload[el.dataset.opt] = el.type === "checkbox" ? el.checked : el.value;
      });
      const stages = ["Translating to English", "Rewriting", "Translating back"];
      const data = lb
        ? await runPivot(plan, tool.endpoint, payload, (k) => plan.translate && setStatus(panel, "loading", stages[k]))
        : await postJson(tool.endpoint, payload);
      output.value = data.result;
      updateCounts(panel, "output", output);
      if (tool.pair) lastTransformation = { original: text, result: data.result };
      if (tool.autoDiff) diffOn = true;
      refreshDiff();
      pushHistory({ tool: tool.id, label: tool.name, input: text, output: data.result });
    }));

    $('[data-action="clear"]', panel).addEventListener("click", () => {
      input.value = "";
      output.value = "";
      updateCounts(panel, "input", input);
      updateCounts(panel, "output", output);
      refreshDiff();
      setStatus(panel, "", "");
    });
    $('[data-action="copy"]', panel).addEventListener("click", () => output.value && copyText(output.value));
    $('[data-action="download"]', panel).addEventListener("click", () => output.value && download(tool.id, output.value));
    diffBtn.addEventListener("click", () => {
      if (!output.value) return toast("Nothing to compare yet.");
      diffOn = !diffOn;
      refreshDiff();
    });

    $('[data-role="sendto"]', panel).addEventListener("change", (e) => {
      const dest = e.target.value;
      e.target.value = "";
      if (!dest || !output.value) return dest && toast("Nothing to send yet.");
      if (dest === "compare") {
        const cp = $("#panel-compare");
        setValue($('[data-role="original"]', cp), input.value.trim());
        setValue($('[data-role="transformed"]', cp), output.value);
      } else {
        setValue($('[data-role="input"]', $(`#panel-${dest}`)), output.value);
      }
      showTab(dest);
    });
  }

  const main = $("#main");
  AI_TOOLS.slice().reverse().forEach((tool) => main.prepend(buildAiPanel(tool)));
  AI_TOOLS.forEach((tool) => wireAiPanel(tool, $(`#panel-${tool.id}`)));

  // ---------- local AI-signal rendering (shared by Detector and Compare) ----------
  const FLAG_TEXT = { high: "stronger signal", mid: "some signal", low: "weak signal", na: "" };
  function signalsHtml(text) {
    const lang = T.detectLanguage(text);
    const english = lang.code === "en" || lang.code === "und";
    const sig = T.aiSignals(text, { english });
    const rows = sig.rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.value)}</td><td><span class="flag ${r.flag}">${FLAG_TEXT[r.flag]}</span></td></tr>`).join("");
    const uniqPhrases = [...new Set(sig.hits.map((h) => h.phrase))];
    return `
      <h3 class="sub">Local signals <span class="muted">(computed in your browser, no AI)</span></h3>
      ${english ? "" : `<p class="notice">Detected ${escapeHtml(lang.name)}. The stock-phrase and transition checks are English-only, so they are skipped. The rest are language-neutral.</p>`}
      <table class="stat-table"><tbody>${rows}</tbody></table>
      ${uniqPhrases.length ? `<p class="muted small">Phrases flagged: ${uniqPhrases.map((p) => `<code>${escapeHtml(p)}</code>`).join(" ")}</p>` : ""}
      <div class="highlight-view">${highlightHtml(text, sig.hits)}</div>
      <p class="disclaimer">These are rough stylistic habits, not proof of authorship. Plenty of human writers use these phrases, and plenty of AI text avoids them.</p>`;
  }
  function highlightHtml(text, hits) {
    let out = "", pos = 0;
    for (const h of hits) {
      out += escapeHtml(text.slice(pos, h.index)) + `<mark${h.group ? ` class="g-${h.group}"` : ""}>${escapeHtml(text.slice(h.index, h.index + h.length))}</mark>`;
      pos = h.index + h.length;
    }
    return out + escapeHtml(text.slice(pos));
  }

  // ---------- detector ----------
  (function wireDetector() {
    const panel = $("#panel-detector");
    const input = $('[data-role="input"]', panel);
    const resultBox = $('[data-role="detector-result"]', panel);
    const EMPTY = '<p class="empty-hint">Run an AI analysis, or a free quick scan that checks stock AI phrases, sentence variety and transition habits locally.</p>';
    const labelFor = (c) => ({ more_human_like: "More human-like", more_ai_like: "More AI-like", mixed_uncertain: "Mixed / uncertain" }[c] || "Mixed / uncertain");

    updateCounts(panel, "input", input);
    input.addEventListener("input", () => updateCounts(panel, "input", input));
    wireUpload(panel);
    const lb = wireLangBar(panel, input, { kind: "detect" });

    $('[data-action="scan"]', panel).addEventListener("click", () => {
      const text = input.value.trim();
      if (!text) return setStatus(panel, "error", "Enter some text first.");
      setStatus(panel, "", "");
      resultBox.innerHTML = signalsHtml(text);
    });

    $('[data-action="detect"]', panel).addEventListener("click", withLoading(panel, async () => {
      const text = input.value.trim();
      if (!text) throw new Error("Enter some text first.");
      const plan = langPlan(lb);
      let analyzed = text;
      if (plan.translate) {
        setStatus(panel, "loading", `Translating ${plan.lang.name} to English`);
        analyzed = clip((await postJson("/api/translate", { text: clip(text), target: "en", tone: "neutral" })).result);
        setStatus(panel, "loading", "Analyzing");
      }
      const data = await postJson(API.detect, { text: analyzed });
      const banner = plan.translate
        ? `<p class="notice">This score is for an <strong>English translation</strong> of your ${escapeHtml(plan.lang.name)} text. Translation smooths away style cues, so treat it as less reliable than an in-language analysis.</p>
           <details class="translation"><summary>Show the translation that was analyzed</summary><div class="highlight-view">${escapeHtml(analyzed)}</div></details>`
        : !plan.lang.isEnglish && plan.lang.code !== "und"
          ? `<p class="notice">Analyzed in ${escapeHtml(plan.lang.name)}. AI detection is less reliable for non-English text and for non-native writers, so weigh this lightly.</p>` : "";
      resultBox.innerHTML = `${banner}
        <div class="score-row">
          <div class="score-label"><span>AI-likeness</span><span>${data.ai_likeness}%</span></div>
          <div class="score-track"><div class="score-fill warn" style="width:${data.ai_likeness}%"></div></div>
        </div>
        <div class="score-row">
          <div class="score-label"><span>Human-likeness</span><span>${data.human_likeness}%</span></div>
          <div class="score-track"><div class="score-fill" style="width:${data.human_likeness}%"></div></div>
        </div>
        <p><strong>${labelFor(data.classification)}</strong><span class="badge">${escapeHtml(data.confidence)} confidence</span></p>
        <ul class="observations">${data.observations.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
        <p class="explanation">${escapeHtml(data.explanation)}</p>
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
        ${plan.translate ? "" : signalsHtml(text)}`;
    }));

    $('[data-action="clear"]', panel).addEventListener("click", () => {
      input.value = "";
      updateCounts(panel, "input", input);
      resultBox.innerHTML = EMPTY;
      setStatus(panel, "", "");
    });
  })();

  // ---------- compare ----------
  (function wireCompare() {
    const panel = $("#panel-compare");
    const a = $('[data-role="original"]', panel);
    const b = $('[data-role="transformed"]', panel);
    const box = $('[data-role="compare-result"]', panel);
    const refresh = () => { updateCounts(panel, "original", a); updateCounts(panel, "transformed", b); };
    refresh();
    a.addEventListener("input", refresh);
    b.addEventListener("input", refresh);
    wireUpload(panel);

    $('[data-action="load-last"]', panel).addEventListener("click", () => {
      if (!lastTransformation) return setStatus(panel, "error", "Run a rewrite (AI → Human, Human → AI, Paraphrase or Grammar) first.");
      setStatus(panel, "", "");
      setValue(a, lastTransformation.original);
      setValue(b, lastTransformation.result);
    });
    $('[data-action="swap"]', panel).addEventListener("click", () => {
      const tmp = a.value;
      setValue(a, b.value);
      setValue(b, tmp);
    });

    const row = (label, x, y) => `<tr><td>${label}</td><td class="num">${x}</td><td class="num">${y}</td></tr>`;
    function renderLocal(x, y) {
      const sx = T.stats(x), sy = T.stats(y);
      const ax = T.aiSignals(x), ay = T.aiSignals(y);
      box.innerHTML = `
        <h3 class="sub">Changes</h3>
        <div class="diff-view" data-role="cmp-diff"></div>
        <h3 class="sub">Side by side <span class="muted">(computed in your browser)</span></h3>
        <table class="stat-table">
          <thead><tr><th></th><th>Original</th><th>Changed</th></tr></thead>
          <tbody>
            ${row("Words", sx.words, sy.words)}
            ${row("Characters", sx.chars, sy.chars)}
            ${row("Sentences", sx.sentences, sy.sentences)}
            ${row("Avg. sentence length", sx.avgSentenceLen, sy.avgSentenceLen)}
            ${row("Readability (Flesch)", `${sx.flesch} · ${sx.fleschLabel}`, `${sy.flesch} · ${sy.fleschLabel}`)}
            ${row("Stock AI phrases", ax.hits.length, ay.hits.length)}
            ${row("Stock AI phrases / 100 words", ax.perHundred, ay.perHundred)}
          </tbody>
        </table>
        <div data-role="ai-block"></div>`;
      renderDiff($('[data-role="cmp-diff"]', box), x, y);
    }
    function need() {
      const x = a.value.trim(), y = b.value.trim();
      if (!x || !y) throw new Error("Fill in both the original and the changed text.");
      return [x, y];
    }

    $('[data-action="do-compare"]', panel).addEventListener("click", () => {
      try { const [x, y] = need(); setStatus(panel, "", ""); renderLocal(x, y); } catch (e) { setStatus(panel, "error", e.message); }
    });
    $('[data-action="ai-compare"]', panel).addEventListener("click", withLoading(panel, async () => {
      const [x, y] = need();
      if (!$('[data-role="ai-block"]', box)) renderLocal(x, y);
      const d = await postJson("/api/compare", { original: x, transformed: y });
      $('[data-role="ai-block"]', box).innerHTML = `
        <h3 class="sub">AI estimate</h3>
        <table class="stat-table">
          <thead><tr><th></th><th>Original</th><th>Changed</th></tr></thead>
          <tbody>
            ${row("AI-likeness (est.)", `${d.aiLikeness.before}%`, `${d.aiLikeness.after}%`)}
            ${row("Human-likeness (est.)", `${d.humanLikeness.before}%`, `${d.humanLikeness.after}%`)}
            ${row("Confidence", escapeHtml(d.confidence.before), escapeHtml(d.confidence.after))}
          </tbody>
        </table>
        <p class="disclaimer">${escapeHtml(d.disclaimer)}</p>`;
    }));
    $('[data-action="clear"]', panel).addEventListener("click", () => {
      a.value = ""; b.value = ""; refresh(); box.innerHTML = ""; setStatus(panel, "", "");
    });
  })();

  // ---------- stats (live, local) ----------
  (function wireStats() {
    const panel = $("#panel-stats");
    const input = $('[data-role="input"]', panel);
    const box = $('[data-role="stats-result"]', panel);
    const EMPTY = '<p class="empty-hint">Start typing to see counts, reading time, readability, keyword density and platform limits.</p>';
    let raf = 0;

    const tile = (v, l) => `<div class="tile"><div class="tile-v">${v}</div><div class="tile-l">${l}</div></div>`;
    const freqTable = (rows, empty) =>
      rows.length
        ? `<table class="stat-table compact"><tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.term)}</td><td class="num">${r.count}×</td><td class="num">${r.pct}%</td></tr>`).join("")}</tbody></table>`
        : `<p class="muted small">${empty}</p>`;

    function render() {
      const text = input.value;
      updateCounts(panel, "input", input);
      if (!text.trim()) { box.innerHTML = EMPTY; return; }
      const s = T.stats(text);
      const lang = T.detectLanguage(text);
      const foreign = lang.code !== "en" && lang.code !== "und";
      const lim = T.limits(text).map((l) => {
        const pct = Math.min(100, (l.count / l.limit) * 100);
        const over = l.count > l.limit;
        return `<div class="limit"><div class="score-label"><span>${l.name}</span><span class="${over ? "over" : ""}">${l.count} / ${l.limit}</span></div><div class="score-track"><div class="score-fill${over ? " over" : ""}" style="width:${pct}%"></div></div></div>`;
      }).join("");
      const longest = s.longest.map((l) => `<li><span class="num">${l.words}w</span> ${escapeHtml(l.text.length > 140 ? l.text.slice(0, 140) + "…" : l.text)}${l.words > 30 ? ' <span class="flag mid">long</span>' : ""}</li>`).join("");
      const repeated = T.frequency(text, { n: 3, top: 6, skipStop: false });
      box.innerHTML = `
        <div class="tiles">
          ${tile(s.words, "Words")}${tile(s.chars, "Characters")}${tile(s.sentences, "Sentences")}
          ${tile(s.paragraphs, "Paragraphs")}${tile(fmtMin(s.readMin), "Reading time")}${tile(fmtMin(s.speakMin), "Speaking time")}
        </div>
        <p class="muted small">Language: ${escapeHtml(lang.name)}${lang.confidence === "low" ? " (unsure)" : ""}${["zh", "ja"].includes(lang.code) ? ". Word counts are approximate for this script (no spaces between words)." : ""}</p>
        <h3 class="sub">Readability <span class="muted">(English heuristics)</span></h3>
        ${foreign ? `<p class="notice">Flesch and grade level only work for English, so they are skipped for ${escapeHtml(lang.name)}.</p>` : ""}
        <table class="stat-table compact"><tbody>
          ${foreign ? "" : row2("Flesch reading ease", `${s.flesch} · ${s.fleschLabel}`)}
          ${foreign ? "" : row2("Grade level (Flesch-Kincaid)", s.grade)}
          ${row2("Avg. sentence length", `${s.avgSentenceLen} words`)}
          ${row2("Avg. word length", `${s.avgWordLen} letters`)}
          ${row2("Vocabulary variety", `${s.lexicalDiversity}% unique words`)}
        </tbody></table>
        <h3 class="sub">Longest sentences</h3><ol class="observations">${longest}</ol>
        <h3 class="sub">Top keywords</h3>${freqTable(T.frequency(text, { n: 1, top: 10 }), "Not enough text yet.")}
        <h3 class="sub">Top two-word phrases</h3>${freqTable(T.frequency(text, { n: 2, top: 6 }), "No phrase repeats yet.")}
        <h3 class="sub">Repeated three-word runs</h3>${freqTable(repeated, "No repeated runs. Good.")}
        <h3 class="sub">Platform limits</h3><div class="limits">${lim}</div>`;
    }
    const row2 = (a, b) => `<tr><td>${a}</td><td class="num">${b}</td></tr>`;

    input.addEventListener("input", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); });
    wireUpload(panel);
    $('[data-action="clear"]', panel).addEventListener("click", () => { input.value = ""; render(); });
  })();

  // ---------- cleaner (local) ----------
  (function wireCleaner() {
    const panel = $("#panel-cleaner");
    const input = $('[data-role="input"]', panel);
    const output = $('[data-role="output"]', panel);
    const GROUPS = [
      ["Case", [["upper", "UPPERCASE"], ["lower", "lowercase"], ["title", "Title Case"], ["sentence", "Sentence case"], ["camel", "camelCase"], ["pascal", "PascalCase"], ["snake", "snake_case"], ["kebab", "kebab-case"], ["constant", "CONSTANT_CASE"], ["slug", "URL slug"]]],
      ["Whitespace & punctuation", [["trimLines", "Trim lines"], ["collapseSpaces", "Collapse spaces"], ["removeBlankLines", "Remove blank lines"], ["unwrap", "Unwrap hard-wrapped lines"], ["removeBreaks", "Remove all line breaks"], ["straightQuotes", "Smart → straight quotes"], ["emDashes", "Em dashes → commas"], ["invisible", "Remove invisible characters"], ["stripHtml", "Strip HTML"], ["stripMarkdown", "Strip Markdown"]]],
      ["Lines", [["sortAZ", "Sort A → Z"], ["sortZA", "Sort Z → A"], ["sortLen", "Sort by length"], ["dedupe", "Remove duplicates"], ["reverse", "Reverse order"], ["shuffle", "Shuffle"], ["numberLines", "Number lines"]]],
      ["Extract", [["emails", "Emails"], ["urls", "URLs"], ["numbers", "Numbers"], ["hashtags", "Hashtags"]]],
    ];
    $('[data-role="cleaner-tools"]', panel).innerHTML = GROUPS.map(([name, ops]) =>
      `<div class="tool-group"><div class="tool-group-name">${name}</div><div class="chips">${ops.map(([id, label]) => `<button class="chip" data-op="${id}">${escapeHtml(label)}</button>`).join("")}</div></div>`
    ).join("");

    const refresh = () => { updateCounts(panel, "input", input); updateCounts(panel, "output", output); };
    refresh();
    input.addEventListener("input", refresh);

    panel.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-op]");
      if (!btn) return;
      if (!input.value) return setStatus(panel, "error", "Paste some text first.");
      const result = T.OPS[btn.dataset.op](input.value);
      output.value = result;
      refresh();
      const delta = input.value.length - result.length;
      const extract = GROUPS[3][1].some(([id]) => id === btn.dataset.op);
      setStatus(panel, "ok", extract ? (result ? `Found ${result.split("\n").length} unique item(s).` : "Nothing found.") : delta > 0 ? `Done · ${delta} character(s) removed.` : "Done.");
    });

    $('[data-action="replace"]', panel).addEventListener("click", () => {
      try {
        const r = T.findReplace(input.value, $('[data-role="find"]', panel).value, $('[data-role="replace"]', panel).value, {
          regex: $('[data-role="regex"]', panel).checked,
          caseSensitive: $('[data-role="case"]', panel).checked,
        });
        output.value = r.text;
        refresh();
        setStatus(panel, "ok", `${r.count} replacement(s).`);
      } catch {
        setStatus(panel, "error", "That regular expression is not valid.");
      }
    });
    $('[data-action="copy"]', panel).addEventListener("click", () => output.value && copyText(output.value));
    $('[data-action="download"]', panel).addEventListener("click", () => output.value && download("cleaned", output.value));
    $('[data-action="reuse"]', panel).addEventListener("click", () => {
      if (!output.value) return;
      input.value = output.value;
      output.value = "";
      refresh();
    });
    $('[data-action="clear"]', panel).addEventListener("click", () => { input.value = ""; output.value = ""; refresh(); setStatus(panel, "", ""); });
  })();


  // ---------- pipeline: humanize -> compare (detect before/after) ----------
  (function wirePipeline() {
    const panel = $("#panel-pipeline");
    const input = $('[data-role="input"]', panel);
    const output = $('[data-role="output"]', panel);
    const steps = $('[data-role="steps"]', panel);
    const box = $('[data-role="pipeline-result"]', panel);
    const stronger = $('[data-action="stronger"]', panel);
    const levelEl = $('[data-opt="level"]', panel);
    const lb = wireLangBar(panel, input, { kind: "pivot" });
    const refresh = () => { updateCounts(panel, "input", input); updateCounts(panel, "output", output); };
    refresh();
    input.addEventListener("input", refresh);
    wireUpload(panel);

    $('[data-action="run"]', panel).addEventListener("click", withLoading(panel, async () => {
      const text = input.value.trim();
      if (!text) throw new Error("Enter some text first.");
      const plan = langPlan(lb); // throws a helpful message if the language can't be handled
      box.innerHTML = "";
      output.value = "";
      refresh();
      stronger.hidden = true;
      const payload = { text };
      $$("[data-opt]", panel).forEach((el) => { payload[el.dataset.opt] = el.type === "checkbox" ? el.checked : el.value; });

      const ln = plan.lang.name;
      const labels = plan.translate
        ? [`Translating ${ln} → English`, "Rewriting in English", `Translating back to ${ln}`, "Scoring original and rewrite"]
        : ["Rewriting", "Scoring original and rewrite"];
      const state = labels.map(() => "wait");
      const paint = () => {
        steps.hidden = false;
        steps.innerHTML = labels.map((l, i) => `<li class="step ${state[i]}">${i + 1}. ${escapeHtml(l)}</li>`).join("");
      };
      const last = labels.length - 1;
      const onStep = (k) => { if (k > 0) state[k - 1] = "done"; state[k] = "run"; paint(); };
      paint();

      const rewrite = await runPivot(plan, "/api/humanize", payload, onStep);
      state.fill("done", 0, last);
      output.value = rewrite.result;
      refresh();
      lastTransformation = { original: text, result: rewrite.result };
      pushHistory({ tool: "pipeline", label: "Pipeline", input: text, output: rewrite.result });

      state[last] = "run"; paint();
      let scores = null;
      try {
        scores = await postJson("/api/compare", { original: clip(text), transformed: clip(rewrite.result) });
        state[last] = "done";
      } catch (e) {
        state[last] = "fail"; labels[last] = "Scoring failed: " + e.message;
      }
      paint();

      const english = plan.lang.isEnglish || plan.lang.code === "und";
      const sx = T.stats(text), sy = T.stats(rewrite.result);
      const ax = T.aiSignals(text, { english }), ay = T.aiSignals(rewrite.result, { english });
      const bar = (label, v) => `<div class="score-row"><div class="score-label"><span>${label}</span><span>${v}%</span></div><div class="score-track"><div class="score-fill warn" style="width:${v}%"></div></div></div>`;
      let verdict = "";
      if (scores) {
        const d = scores.aiLikeness.after - scores.aiLikeness.before;
        verdict = d <= -10 ? `AI-likeness estimate dropped by ${-d} points.`
          : d >= 10 ? `AI-likeness estimate went up by ${d} points. This rewrite did not help by this measure.`
          : "AI-likeness estimate barely moved (within ±10 points, which is inside the estimator's noise).";
        stronger.hidden = levelEl.value === "strong" || d <= -10;
      }
      const langNote = !plan.lang.isEnglish && plan.lang.code !== "und"
        ? `<p class="notice">${escapeHtml(ln)} text${plan.translate ? ", processed via English" : ", processed in its own language"}. AI scoring is less reliable for non-English text. Read the result yourself, especially after back-translation.</p>` : "";
      box.innerHTML = `
        ${langNote}
        ${scores ? `<h3 class="sub">Estimated AI-likeness</h3>
          <div class="before-after"><div><div class="muted small">Before</div>${bar("AI-likeness", scores.aiLikeness.before)}</div>
          <div><div class="muted small">After</div>${bar("AI-likeness", scores.aiLikeness.after)}</div></div>
          <p><strong>${escapeHtml(verdict)}</strong></p>` : ""}
        <h3 class="sub">Local comparison</h3>
        <table class="stat-table"><thead><tr><th></th><th>Before</th><th>After</th></tr></thead><tbody>
          <tr><td>Words</td><td class="num">${sx.words}</td><td class="num">${sy.words}</td></tr>
          <tr><td>Avg. sentence length</td><td class="num">${sx.avgSentenceLen}</td><td class="num">${sy.avgSentenceLen}</td></tr>
          ${english ? `<tr><td>Readability (Flesch)</td><td class="num">${sx.flesch}</td><td class="num">${sy.flesch}</td></tr>
          <tr><td>Stock AI phrases</td><td class="num">${ax.hits.length}</td><td class="num">${ay.hits.length}</td></tr>` : ""}
        </tbody></table>
        ${rewrite.via ? `<details class="translation"><summary>Show the English version that was rewritten</summary><div class="highlight-view">${escapeHtml(rewrite.via)}</div></details>` : ""}
        <h3 class="sub">Changes</h3><div class="diff-view" data-role="pl-diff"></div>
        <p class="disclaimer">${escapeHtml(scores ? scores.disclaimer : "AI scoring was unavailable, so only local measures are shown.")} Always read the rewrite yourself: it should keep every fact and claim from the original.</p>`;
      renderDiff($('[data-role="pl-diff"]', box), text, rewrite.result);
    }));

    stronger.addEventListener("click", () => { levelEl.value = "strong"; $('[data-action="run"]', panel).click(); });
    $('[data-action="copy"]', panel).addEventListener("click", () => output.value && copyText(output.value));
    $('[data-action="download"]', panel).addEventListener("click", () => output.value && download("pipeline", output.value));
    $('[data-action="clear"]', panel).addEventListener("click", () => {
      input.value = ""; output.value = ""; refresh(); box.innerHTML = ""; steps.hidden = true; stronger.hidden = true; setStatus(panel, "", "");
      lb.update();
    });
  })();

  // ---------- tone check ----------
  (function wireTone() {
    const panel = $("#panel-tone");
    const input = $('[data-role="input"]', panel);
    const box = $('[data-role="tone-result"]', panel);
    const EMPTY = box.innerHTML;
    let rewrite = "";
    updateCounts(panel, "input", input);
    input.addEventListener("input", () => updateCounts(panel, "input", input));
    wireUpload(panel);

    function localHtml(text) {
      const lang = T.detectLanguage(text);
      if (lang.code !== "en" && lang.code !== "und") {
        return `<p class="notice">Detected ${escapeHtml(lang.name)}. The free phrase scan only knows English, so it is skipped. The AI tone check works in your language.</p>`;
      }
      const sig = T.toneSignals(text);
      const flagFor = { hedge: "mid", passive: "high", demand: "high", polite: "low" };
      const rows = sig.groups.map((g) => `<tr><td>${escapeHtml(g.label)}</td><td>${g.count ? g.phrases.map((p) => `<code>${escapeHtml(p)}</code>`).join(" ") : '<span class="muted">none</span>'}</td><td>${g.count && g.id !== "polite" ? `<span class="flag ${flagFor[g.id]}">${g.count}×</span>` : g.count ? `<span class="flag low">${g.count}×</span>` : ""}</td></tr>`).join("");
      const extras = [];
      if (sig.exclaims >= 3) extras.push(`${sig.exclaims} exclamation marks can read as shouting or over-eager.`);
      if (sig.caps) extras.push(`${sig.caps} word(s) in ALL CAPS may read as raised-voice.`);
      if (sig.words > 120 && !sig.groups.find((g) => g.id === "polite").count) extras.push("Long message with no please/thanks. It may feel abrupt.");
      return `
        <h3 class="sub">Local scan <span class="muted">(your browser, no AI)</span></h3>
        <table class="stat-table"><tbody>${rows}</tbody></table>
        ${extras.length ? `<ul class="observations">${extras.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}
        <div class="highlight-view">${highlightHtml(text, sig.hits)}</div>
        <p class="disclaimer">Phrase matching is crude. Context decides tone, so treat highlights as prompts to re-read, not verdicts.</p>`;
    }

    $('[data-action="scan"]', panel).addEventListener("click", () => {
      const text = input.value.trim();
      if (!text) return setStatus(panel, "error", "Enter some text first.");
      setStatus(panel, "", "");
      box.innerHTML = localHtml(text);
    });

    $('[data-action="tone"]', panel).addEventListener("click", withLoading(panel, async () => {
      const text = input.value.trim();
      if (!text) throw new Error("Enter some text first.");
      const payload = { text };
      $$("[data-opt]", panel).forEach((el) => { payload[el.dataset.opt] = el.value; });
      const d = await postJson("/api/tone", payload);
      rewrite = d.rewrite;
      const meter = (label, v) => `<div class="score-row"><div class="score-label"><span>${label}</span><span>${v}</span></div><div class="score-track"><div class="score-fill" style="width:${v}%"></div></div></div>`;
      const list = (arr) => (arr.length ? `<ul class="observations">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : '<p class="muted small">None found.</p>');
      box.innerHTML = `
        <p><strong>${escapeHtml(d.overall)}</strong></p>
        ${meter("Formality", d.scores.formality)}${meter("Warmth", d.scores.warmth)}${meter("Assertiveness", d.scores.assertiveness)}${meter("Urgency", d.scores.urgency)}
        <h3 class="sub">Likely to be read as</h3>${list(d.perceivedAs)}
        <h3 class="sub">Risky phrases</h3>${list(d.risks)}
        <h3 class="sub">Suggestions</h3>${list(d.suggestions)}
        ${d.rewrite ? `<h3 class="sub">Suggested rewrite</h3>
          <div class="diff-body rewrite-box" data-role="rewrite-text">${escapeHtml(d.rewrite)}</div>
          <div class="editor-actions"><button class="btn ghost small" data-tone-act="copy">Copy rewrite</button>
          <button class="btn ghost small" data-tone-act="diff">Show changes</button>
          <button class="btn ghost small" data-tone-act="use">Use as input</button></div>
          <div class="diff-view" data-role="tone-diff" hidden></div>` : ""}
        <p class="disclaimer">AI judgement of tone is subjective, so treat this as a second opinion. You know the reader better than the model does.</p>
        ${localHtml(text)}`;
    }));

    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tone-act]");
      if (!b) return;
      const act = b.dataset.toneAct;
      if (act === "copy") copyText(rewrite);
      else if (act === "use") { setValue(input, rewrite); box.innerHTML = EMPTY; toast("Rewrite moved into the input"); }
      else if (act === "diff") {
        const dv = $('[data-role="tone-diff"]', box);
        dv.hidden = !dv.hidden;
        if (!dv.hidden) renderDiff(dv, input.value.trim(), rewrite);
        b.textContent = dv.hidden ? "Show changes" : "Hide changes";
      }
    });

    $('[data-action="clear"]', panel).addEventListener("click", () => {
      input.value = ""; updateCounts(panel, "input", input); box.innerHTML = EMPTY; setStatus(panel, "", "");
    });
  })();


  // ---------- auto: paste anything → analyze → recommend → act (with chunking) ----------
  (function wireAuto() {
    const panel = $("#panel-auto");
    const MAX_AUTO = 30000;
    const MAX_CHUNKS = 5;
    const input = $('[data-role="input"]', panel);
    const analysis = $('[data-role="auto-analysis"]', panel);
    const outWrap = $('[data-role="auto-output"]', panel);
    const output = $('[data-role="output"]', outWrap);
    const diffView = $('[data-role="diff-view"]', outWrap);
    const diffBtn = $('[data-action="diff"]', outWrap);
    const recheck = $('[data-role="recheck"]', outWrap);
    const badge = $('[data-role="lang-badge"]', panel);
    const meta = $('[data-role="meta"]', panel);
    const target = $('[data-role="auto-target"]', panel);
    const EMPTY = analysis.innerHTML;
    target.innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${escapeHtml(n)}</option>`).join("");
    target.value = "hi";

    const ACTIONS = {
      humanize: { endpoint: "/api/humanize", title: "Humanized", tool: "ai-human", opts: () => ({ style: "natural", level: "medium", preserveLength: false, preserveTerminology: true }) },
      aiify: { endpoint: "/api/aiify", title: "Structured", tool: "human-ai", opts: () => ({ style: "general", structureLevel: "medium" }) },
      paraphrase: { endpoint: "/api/paraphrase", title: "Paraphrased", tool: "paraphrase", opts: () => ({ mode: "standard", preserveTerminology: true }) },
      grammar: { endpoint: "/api/grammar", title: "Corrected", tool: "grammar", diff: true, opts: () => ({ mode: "proofread", dialect: "us" }) },
      summarize: { endpoint: "/api/summarize", title: "Summary", tool: "summarize", opts: () => ({ format: "bullets", length: "medium" }) },
      translate: { endpoint: "/api/translate", title: "Translation", tool: "translate", opts: () => ({ target: target.value, tone: "neutral" }) },
    };
    let current = null;      // action id whose result is on screen
    let beforeScore = null;  // AI-likeness from the last Analyze
    let sourceForDiff = "";

    const refreshCounts = () => { updateCounts(panel, "input", input); updateCounts(panel, "output", output); };
    refreshCounts();
    wireUpload(panel);

    let timer;
    function updateMeta() {
      const text = input.value;
      if (!text.trim()) { badge.textContent = "Language: —"; badge.className = "lang-badge"; return; }
      const l = T.detectLanguage(text);
      badge.textContent = l.code === "und" ? "Language: unknown" : `Detected: ${l.name}${l.confidence === "low" ? " (unsure)" : ""}`;
      badge.className = "lang-badge" + (l.isEnglish ? "" : " foreign");
      const n = T.chunkText(text).length;
      meta.textContent = n > 1 ? `Long text: actions will use ${n} AI requests (one per chunk).` : "Paste text in any language, up to about 30,000 characters. Long text is processed in chunks.";
    }
    input.addEventListener("input", () => { refreshCounts(); clearTimeout(timer); timer = setTimeout(updateMeta, 200); });

    function chunksOrThrow(text) {
      const chunks = T.chunkText(text);
      if (chunks.length > MAX_CHUNKS) throw new Error(`That's too long even for chunking (${chunks.length} parts, max ${MAX_CHUNKS}). Split it into smaller documents.`);
      return chunks;
    }
    const clearRecommendation = () => $$(".chip.rec", panel).forEach((c) => c.classList.remove("rec"));

    // ----- analyze -----
    $('[data-action="analyze"]', panel).addEventListener("click", withLoading(panel, async () => {
      const text = input.value.trim();
      if (!text) throw new Error("Enter some text first.");
      const chunks = chunksOrThrow(text);
      const lang = T.detectLanguage(text);
      const s = T.stats(text);
      const data = await postJson(API.detect, { text: chunks[0] });
      beforeScore = data.ai_likeness;
      clearRecommendation();
      const rec = data.classification === "more_ai_like" ? "humanize" : data.classification === "more_human_like" ? "grammar" : null;
      if (rec) $(`[data-act="${rec}"]`, panel).classList.add("rec");
      const advice = data.classification === "more_ai_like"
        ? "Reads as more AI-like. <strong>Humanize</strong> is highlighted below, and it keeps your language."
        : data.classification === "more_human_like"
          ? "Reads as more human-like. You may not need to change it. <strong>Fix grammar</strong> is highlighted if you want a polish."
          : "Mixed signals. Read it yourself before changing anything. Humanize is available if you want a more natural voice.";
      const foreign = !lang.isEnglish && lang.code !== "und";
      const label = { more_human_like: "More human-like", more_ai_like: "More AI-like", mixed_uncertain: "Mixed / uncertain" }[data.classification] || "Mixed / uncertain";
      analysis.innerHTML = `
        <div class="tiles">
          <div class="tile"><div class="tile-v">${escapeHtml(lang.code === "und" ? "?" : lang.name.split(" ")[0])}</div><div class="tile-l">Language${lang.confidence === "low" ? " (unsure)" : ""}</div></div>
          <div class="tile"><div class="tile-v">${s.words}</div><div class="tile-l">Words</div></div>
          <div class="tile"><div class="tile-v">${fmtMin(s.readMin)}</div><div class="tile-l">Reading time</div></div>
        </div>
        ${foreign ? `<p class="notice">${escapeHtml(lang.name)} text. AI detection is less reliable outside English and can wrongly flag non-native writers, so weigh the score lightly.</p>` : ""}
        ${chunks.length > 1 ? `<p class="notice">Long text: only the first part (${chunks[0].length} characters) was scored.</p>` : ""}
        <div class="score-row" style="margin-top:14px"><div class="score-label"><span>AI-likeness (estimate)</span><span>${data.ai_likeness}%</span></div><div class="score-track"><div class="score-fill warn" style="width:${data.ai_likeness}%"></div></div></div>
        <p><strong>${label}</strong><span class="badge">${escapeHtml(data.confidence)} confidence</span></p>
        <p class="explanation">${advice}</p>
        <ul class="observations">${data.observations.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>`;
    }));

    // ----- actions (chunked) -----
    async function runAction(id) {
      const text = input.value.trim();
      if (!text) throw new Error("Enter some text first.");
      const a = ACTIONS[id];
      const chunks = chunksOrThrow(text);
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        setStatus(panel, "loading", chunks.length > 1 ? `${a.title}: part ${i + 1} of ${chunks.length}` : "Working");
        results.push((await postJson(a.endpoint, { text: chunks[i], ...a.opts() })).result);
      }
      let result = results.join("\n\n");
      if (id === "summarize" && chunks.length > 1) {
        setStatus(panel, "loading", "Combining the part summaries");
        result = (await postJson(a.endpoint, { text: clip(result), ...a.opts() })).result;
      }
      sourceForDiff = text;
      current = id;
      output.value = result;
      $('[data-role="out-title"]', outWrap).textContent = id === "translate" ? `${a.title} → ${LANG_NAME[target.value]}` : a.title;
      outWrap.hidden = false;
      recheck.innerHTML = "";
      refreshCounts();
      diffOn = !!a.diff;
      refreshDiff();
      pushHistory({ tool: "auto", label: `Auto · ${a.title}`, input: text, output: result });
      lastTransformation = ["humanize", "aiify", "paraphrase", "grammar"].includes(id) ? { original: text, result } : lastTransformation;
      outWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    $$("[data-act]", panel).forEach((btn) => btn.addEventListener("click", withLoading(panel, () => runAction(btn.dataset.act))));

    // ----- output tools -----
    let diffOn = false;
    function refreshDiff() {
      diffView.hidden = !(diffOn && output.value);
      diffBtn.setAttribute("aria-pressed", String(diffOn));
      diffBtn.textContent = diffOn ? "Hide changes" : "Show changes";
      if (!diffView.hidden) renderDiff(diffView, sourceForDiff, output.value);
    }
    diffBtn.addEventListener("click", () => { diffOn = !diffOn; refreshDiff(); });
    $('[data-action="copy"]', outWrap).addEventListener("click", () => output.value && copyText(output.value));
    $('[data-action="download"]', outWrap).addEventListener("click", () => output.value && download(`auto-${current || "result"}`, output.value));
    $('[data-action="reuse"]', outWrap).addEventListener("click", () => {
      if (!output.value) return;
      setValue(input, output.value);
      outWrap.hidden = true; output.value = ""; recheck.innerHTML = ""; analysis.innerHTML = EMPTY; beforeScore = null; clearRecommendation();
      toast("Result moved into the input");
    });
    $('[data-action="open-tool"]', outWrap).addEventListener("click", () => {
      if (!current) return;
      const toolId = ACTIONS[current].tool;
      setValue($('[data-role="input"]', $(`#panel-${toolId}`)), clip(sourceForDiff));
      showTab(toolId);
    });
    $('[data-action="recheck"]', outWrap).addEventListener("click", withLoading(panel, async () => {
      if (!output.value) return;
      const data = await postJson(API.detect, { text: T.chunkText(output.value)[0] });
      const lang = T.detectLanguage(output.value);
      const delta = beforeScore == null ? "" : `<p><strong>AI-likeness ${beforeScore}% → ${data.ai_likeness}%</strong> (estimates; changes under about 10 points are within noise).</p>`;
      recheck.innerHTML = `<div class="result-box"><div class="score-row"><div class="score-label"><span>AI-likeness of the result (estimate)</span><span>${data.ai_likeness}%</span></div><div class="score-track"><div class="score-fill warn" style="width:${data.ai_likeness}%"></div></div></div>
        ${delta}<p class="explanation">${escapeHtml(data.explanation)}</p>
        ${!lang.isEnglish && lang.code !== "und" ? `<p class="notice">${escapeHtml(lang.name)} text: scores are less reliable.</p>` : ""}
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p></div>`;
    }));

    $('[data-action="clear"]', panel).addEventListener("click", () => {
      input.value = ""; output.value = ""; outWrap.hidden = true; recheck.innerHTML = ""; analysis.innerHTML = EMPTY;
      beforeScore = null; clearRecommendation(); refreshCounts(); updateMeta(); setStatus(panel, "", "");
    });
  })();

  // ---------- keyboard shortcuts & routing ----------
  document.addEventListener("keydown", (e) => {
    const active = $(".panel.active");
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && active) {
      const btn = $(".btn.primary", active);
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    } else if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const i = tabs.findIndex((t) => t.classList.contains("active"));
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      e.preventDefault();
      showTab(next.dataset.tab);
    }
  });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1), { updateHash: false }));
  showTab(location.hash.slice(1) || "auto", { updateHash: false });
})();
