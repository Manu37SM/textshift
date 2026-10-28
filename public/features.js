// TextShift — privacy shield, voice profile, Turnstile, quota meter, meaning guard, read-aloud,
// remembered settings, offline notices. Loaded after textlib.js and before app.js.
(() => {
  "use strict";
  const T = window.TextLib;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const toast = (m) => { const el = $("#toast"); if (!el) return; el.textContent = m; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2600); };

  // ---------- privacy shield ----------
  const SHIELD_KEY = "textshift-shield-v1";
  let shieldOn = store.get(SHIELD_KEY, true) !== false;
  const MASK_FIELDS = ["text", "original", "transformed", "voice"];
  const NO_DROP_WARN = /\/api\/(summarize|detect|compare|tone)$/;
  function deepUnmask(v, map) {
    if (typeof v === "string") return T.unmaskPII(v, map);
    if (Array.isArray(v)) return v.map((x) => deepUnmask(x, map));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepUnmask(x, map)]));
    return v;
  }

  // ---------- voice profile ----------
  const VOICE_KEY = "textshift-voice-v1";
  const VOICE_MAX = 1500;
  const VOICE_URLS = /\/api\/(humanize|aiify|paraphrase|grammar|tone)$/;
  let voice = store.get(VOICE_KEY, { text: "", on: false });
  const activeVoice = () => (voice.on && voice.text.trim().length >= 40 ? voice.text.trim().slice(0, VOICE_MAX) : "");

  // ---------- Turnstile ----------
  let tsWidget = null, tsPending = null, tsQueue = Promise.resolve(), tsEnabled = false;
  const cfgReady = (async () => {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) return;
      const cfg = await res.json();
      if (!cfg.turnstileSiteKey) return;
      await new Promise((ok, fail) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true; s.onload = ok; s.onerror = () => fail(new Error("Turnstile script blocked"));
        document.head.appendChild(s);
      });
      tsWidget = window.turnstile.render("#ts-container", {
        sitekey: cfg.turnstileSiteKey, execution: "execute", appearance: "interaction-only",
        callback: (t) => tsPending && tsPending.res(t),
        "error-callback": () => tsPending && tsPending.rej(new Error("Verification failed. Reload and try again.")),
        "expired-callback": () => {},
      });
      tsEnabled = true;
    } catch { /* no widget → requests go without a token (server decides) */ }
  })();
  function getToken() {
    const p = tsQueue.then(() => new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error("Verification timed out. Reload and try again.")), 30000);
      tsPending = { res: (t) => { clearTimeout(timer); res(t); }, rej: (e) => { clearTimeout(timer); rej(e); } };
      window.turnstile.reset(tsWidget);
      window.turnstile.execute(tsWidget);
    }));
    tsQueue = p.catch(() => {});
    return p;
  }

  // ---------- quota chip ----------
  function setQuota(remaining, limit) {
    const chip = $("#quota-chip");
    if (!chip || !Number.isFinite(remaining)) return;
    chip.hidden = false;
    chip.textContent = `${remaining} left today`;
    chip.title = `Free AI requests remaining today (limit ${limit}). Local tools never count.`;
    chip.classList.toggle("low", remaining <= Math.max(3, Math.floor(limit * 0.1)));
  }

  // ---------- the one request path ----------
  async function post(url, body) {
    if (!navigator.onLine) throw new Error("You're offline. The AI tools need a connection; local tools still work.");
    const payload = { ...body };
    const state = { map: {}, counts: {}, total: 0 };
    const v = activeVoice();
    if (v && VOICE_URLS.test(url) && payload.voice == null) payload.voice = v;
    if (shieldOn) for (const f of MASK_FIELDS) if (typeof payload[f] === "string") payload[f] = T.maskPII(payload[f], state).masked;
    await cfgReady;
    const headers = { "Content-Type": "application/json" };
    if (tsEnabled) headers["X-Turnstile-Token"] = await getToken();
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const rem = res.headers.get("X-RateLimit-Remaining"), lim = res.headers.get("X-RateLimit-Limit");
    if (rem != null) setQuota(Number(rem), Number(lim));
    let data = null;
    try { data = await res.json(); } catch { /* handled below */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (HTTP ${res.status}).`);
    if (state.total) {
      if (!NO_DROP_WARN.test(url) && typeof data.result === "string") {
        const dropped = T.droppedTokens(data.result, state.map);
        if (dropped.length) toast(`The model dropped ${dropped.length} masked item(s) (${dropped.join(", ")}). Check the output.`);
        else toast(`Privacy shield: ${state.total} item(s) masked, restored in the result.`);
      } else toast(`Privacy shield: ${state.total} item(s) masked before sending.`);
      data = deepUnmask(data, state.map);
    }
    return data;
  }

  // ---------- meaning guard ----------
  function renderGuard(el, original, result, mode) {
    if (!el) return;
    if (mode === "none" || !original || !result) { el.hidden = true; return; }
    const g = T.meaningGuard(original, result, { names: mode !== "light" });
    if (!g.checked) { el.hidden = true; return; }
    el.hidden = false;
    const label = (f) => `<code>${esc(f.value)}</code>`;
    if (!g.missing.length && !g.added.length) {
      el.className = "guard ok";
      el.innerHTML = `✓ Meaning guard: ${g.checked} number(s), link(s)${mode === "light" ? "" : " and name(s)"} carried over.`;
      return;
    }
    el.className = "guard warn";
    el.innerHTML = `<strong>Meaning guard</strong>` +
      (g.missing.length ? `<div>Not found in the result: ${g.missing.map(label).join(", ")}</div>` : "") +
      (g.added.length ? `<div>New in the result: ${g.added.map(label).join(", ")}</div>` : "") +
      `<div class="muted small">Check these before using the text. Renamed or reworded items can show up here too.</div>`;
  }

  // ---------- read aloud ----------
  const BCP = { en: "en-US", hi: "hi-IN", mr: "mr-IN", gu: "gu-IN", ta: "ta-IN", te: "te-IN", bn: "bn-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", ur: "ur-PK", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR", it: "it-IT", ar: "ar-SA", ja: "ja-JP", zh: "zh-CN", ko: "ko-KR", ru: "ru-RU" };
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let speaking = null;
  function stopSpeaking() { if (canSpeak) speechSynthesis.cancel(); if (speaking) { speaking.textContent = "Listen"; speaking = null; } }
  function speak(text, btn) {
    if (!canSpeak) return toast("Read aloud isn't supported in this browser.");
    if (speaking === btn) return stopSpeaking();
    stopSpeaking();
    const code = T.detectLanguage(text).code;
    const lang = BCP[code] || "en-US";
    const voices = speechSynthesis.getVoices();
    if (voices.length && !voices.some((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()))) {
      return toast(`No ${lang} voice is installed on this device.`);
    }
    const parts = T.sentences(text).flatMap((s) => (s.length > 220 ? s.match(/.{1,200}(\s|$)/g) || [s] : [s]));
    speaking = btn; btn.textContent = "Stop";
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = lang;
      if (i === parts.length - 1) u.onend = () => { if (speaking === btn) { btn.textContent = "Listen"; speaking = null; } };
      u.onerror = () => { if (speaking === btn) { btn.textContent = "Listen"; speaking = null; } };
      speechSynthesis.speak(u);
    });
  }

  /** Called by app.js after a result lands. Adds the guard line and Listen button on demand. */
  function after(panel, original, result, { guard = "full" } = {}) {
    const out = $('[data-role="output"]', panel);
    if (!out) return;
    let el = $('[data-role="guard"]', panel);
    if (!el) {
      el = document.createElement("div");
      el.dataset.role = "guard"; el.hidden = true; el.setAttribute("aria-live", "polite");
      const host = out.closest(".editor-col") || out.parentElement;
      host.appendChild(el);
    }
    renderGuard(el, original, result, guard);
    if (canSpeak && !$('[data-action="listen"]', panel)) {
      const bar = (out.closest(".editor-col") || out.parentElement).querySelector(".editor-actions");
      if (bar) {
        const b = document.createElement("button");
        b.className = "btn ghost"; b.type = "button"; b.dataset.action = "listen"; b.textContent = "Listen";
        b.addEventListener("click", () => out.value && speak(out.value, b));
        bar.appendChild(b);
      }
    }
    if (speaking) stopSpeaking();
  }

  // ---------- remembered settings ----------
  const OPTS_KEY = "textshift-opts-v1";
  function persistAll() {
    const all = store.get(OPTS_KEY, {});
    $$(".panel").forEach((panel) => {
      const id = panel.id.replace(/^panel-/, "");
      const els = $$("[data-opt], [data-role='auto-target'], [data-persist]", panel);
      els.forEach((el) => {
        const key = el.dataset.opt || el.dataset.persist || el.dataset.role;
        const saved = all[id] && all[id][key];
        if (saved !== undefined) {
          if (el.type === "checkbox") el.checked = !!saved;
          else if (el.tagName !== "SELECT" || Array.from(el.options).some((o) => o.value === String(saved))) el.value = saved;
        }
        el.addEventListener("change", () => {
          const cur = store.get(OPTS_KEY, {});
          (cur[id] = cur[id] || {})[key] = el.type === "checkbox" ? el.checked : el.value;
          store.set(OPTS_KEY, cur);
        });
      });
    });
  }

  // ---------- topbar wiring ----------
  function wireTopbar() {
    const sh = $("#shield-toggle");
    if (sh) {
      sh.checked = shieldOn;
      sh.addEventListener("change", () => { shieldOn = sh.checked; store.set(SHIELD_KEY, shieldOn); toast(shieldOn ? "Privacy shield on" : "Privacy shield off: sensitive items are sent as typed"); });
    }
    const dlg = $("#voice-dialog"), btn = $("#voice-btn");
    if (!dlg || !btn) return;
    const text = $("#voice-text"), on = $("#voice-on"), stats = $("#voice-stats"), count = $("#voice-count");
    const paintBtn = () => btn.classList.toggle("active", !!activeVoice());
    const paintStats = () => {
      count.textContent = `${text.value.length}/${VOICE_MAX}`;
      const s = T.voiceStats(text.value);
      stats.innerHTML = s.lines.map((l) => `<li>${esc(l)}</li>`).join("");
    };
    btn.addEventListener("click", () => { text.value = voice.text; on.checked = voice.on; paintStats(); dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", ""); });
    text.addEventListener("input", paintStats);
    $("#voice-save").addEventListener("click", () => {
      voice = { text: text.value.slice(0, VOICE_MAX), on: on.checked };
      store.set(VOICE_KEY, voice); paintBtn();
      if (on.checked && text.value.trim().length < 40) toast("Add at least ~40 characters of your own writing for it to take effect.");
      else toast(on.checked ? "Voice profile saved and active" : "Voice profile saved (off)");
      dlg.close();
    });
    $("#voice-clear").addEventListener("click", () => { voice = { text: "", on: false }; store.set(VOICE_KEY, voice); text.value = ""; on.checked = false; paintStats(); paintBtn(); toast("Voice profile cleared"); });
    $("#voice-close").addEventListener("click", () => dlg.close());
    paintBtn();
  }

  // ---------- offline + service worker ----------
  window.addEventListener("offline", () => toast("You're offline. Local tools still work; AI tools need a connection."));
  window.addEventListener("online", () => toast("Back online"));
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  window.TSX = { post, after, renderGuard, persistAll, speak, stopSpeaking, wireTopbar, isShieldOn: () => shieldOn, activeVoice };
  document.addEventListener("DOMContentLoaded", wireTopbar);
})();
