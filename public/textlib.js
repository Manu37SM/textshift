// TextShift local text library — pure functions, no DOM, no network.
// Everything here runs in the browser (and in Node for tests) and costs no AI quota.
(function (root) {
  "use strict";

  const WORD_RE = /[\p{L}\p{M}\p{N}'’]+/gu;
  const words = (t) => t.match(WORD_RE) || [];
  const sentences = (t) =>
    t.split(/(?<=[.!?…।॥])\s+|(?<=[。！？])\s*|\n+/).map((s) => s.trim()).filter((s) => words(s).length > 0);
  const paragraphs = (t) => t.split(/\n\s*\n/).filter((p) => p.trim());
  const round = (n, d = 1) => Number(n.toFixed(d));

  const STOP = new Set(
    ("a about after all also am an and any are as at be because been but by can could did do does for from had has have he her " +
      "here him his how i if in into is it its just like me more most my no not of on one only or our out over she so some than " +
      "that the their them then there these they this to too up us was we were what when which who will with would you your")
      .split(" ")
  );

  // ---------- syllables / readability (English heuristics) ----------
  function syllables(word) {
    let w = word.toLowerCase().replace(/[^a-z]/g, "");
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
    const m = w.match(/[aeiouy]+/g);
    return m ? m.length : 1;
  }

  function readabilityLabel(f) {
    if (f >= 90) return "Very easy";
    if (f >= 80) return "Easy";
    if (f >= 70) return "Fairly easy";
    if (f >= 60) return "Plain English";
    if (f >= 50) return "Fairly difficult";
    if (f >= 30) return "Difficult";
    return "Very difficult";
  }

  function stats(text) {
    const ws = words(text);
    const ss = sentences(text);
    const nW = ws.length;
    const nS = ss.length || (nW ? 1 : 0);
    const syl = ws.reduce((n, w) => n + syllables(w), 0);
    const unique = new Set(ws.map((w) => w.toLowerCase())).size;
    const flesch = nW && nS ? 206.835 - 1.015 * (nW / nS) - 84.6 * (syl / nW) : 0;
    const grade = nW && nS ? 0.39 * (nW / nS) + 11.8 * (syl / nW) - 15.59 : 0;
    const longest = ss
      .map((s) => ({ text: s, words: words(s).length }))
      .sort((a, b) => b.words - a.words)
      .slice(0, 3);
    return {
      chars: Array.from(text).length,
      charsNoSpaces: Array.from(text.replace(/\s/g, "")).length,
      words: nW,
      sentences: nS,
      paragraphs: paragraphs(text).length,
      lines: text ? text.split("\n").length : 0,
      syllables: syl,
      uniqueWords: unique,
      lexicalDiversity: nW ? round((unique / nW) * 100, 0) : 0,
      avgWordLen: nW ? round(ws.reduce((n, w) => n + w.length, 0) / nW, 1) : 0,
      avgSentenceLen: nS ? round(nW / nS, 1) : 0,
      readMin: round(nW / 238),
      speakMin: round(nW / 150),
      flesch: round(Math.max(-50, Math.min(120, flesch)), 0),
      fleschLabel: nW ? readabilityLabel(flesch) : "",
      grade: round(Math.max(0, grade), 1),
      longest,
    };
  }

  // ---------- frequency ----------
  function frequency(text, { n = 1, top = 12, skipStop = true } = {}) {
    const ws = words(text.toLowerCase()).map((w) => w.replace(/^['’]+|['’]+$/g, "")).filter(Boolean);
    const counts = new Map();
    for (let i = 0; i + n <= ws.length; i++) {
      const gram = ws.slice(i, i + n);
      if (skipStop) {
        if (n === 1 && (STOP.has(gram[0]) || gram[0].length < 3 || /^\d+$/.test(gram[0]))) continue;
        if (n > 1 && (STOP.has(gram[0]) || STOP.has(gram[n - 1]))) continue;
      }
      const key = gram.join(" ");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const total = Math.max(1, ws.length);
    return [...counts.entries()]
      .filter(([, c]) => (n === 1 ? c >= 1 : c >= 2))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, top)
      .map(([term, count]) => ({ term, count, pct: round((count / total) * 100, 1) }));
  }

  // ---------- platform limits ----------
  const LIMITS = [
    { name: "X / Twitter post", limit: 280, x: true },
    { name: "Instagram caption", limit: 2200 },
    { name: "LinkedIn post", limit: 3000 },
    { name: "SMS (single)", limit: 160 },
    { name: "Meta description", limit: 160 },
    { name: "SEO title", limit: 60 },
    { name: "YouTube title", limit: 100 },
  ];
  function limits(text) {
    const plain = Array.from(text).length;
    const x = Array.from(text.replace(/https?:\/\/\S+/g, "x".repeat(23))).length;
    return LIMITS.map((l) => ({ name: l.name, limit: l.limit, count: l.x ? x : plain }));
  }

  // ---------- AI-style signals (local heuristics, not proof) ----------
  const AI_PHRASES = [
    "delve", "delves", "delving", "tapestry", "testament to", "in today's fast-paced", "in today's digital",
    "it is important to note", "it's important to note", "it is worth noting", "it's worth noting",
    "in conclusion", "in summary", "to sum up", "moreover", "furthermore", "additionally",
    "navigate the complexities", "navigating the", "landscape", "in the realm of", "realm of", "unlock the",
    "unleash", "leverage", "leveraging", "seamless", "seamlessly", "robust", "holistic", "game-changer",
    "game changer", "pivotal", "crucial", "underscore", "underscores", "foster", "fostering", "elevate",
    "embark", "journey", "multifaceted", "plays a crucial role", "plays a vital role", "a myriad of",
    "ever-evolving", "ever-changing", "shed light on", "paramount", "meticulous", "meticulously", "intricate",
    "vibrant", "bustling", "beacon", "harness", "streamline", "cutting-edge", "state-of-the-art",
    "let's dive", "dive into", "deep dive", "i hope this helps", "as an ai", "rich tapestry", "stands as a",
  ];
  const AI_RES = AI_PHRASES.map((p) => ({
    phrase: p,
    re: new RegExp("(?<![\\p{L}])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]") + "(?![\\p{L}])", "giu"),
  }));
  const TRANSITIONS = /^(moreover|furthermore|additionally|however|therefore|consequently|overall|in conclusion|in summary|ultimately|notably)\b/i;

  function aiSignals(text, { english = true } = {}) {
    const ws = words(text);
    const ss = sentences(text);
    const hits = [];
    for (const { phrase, re } of AI_RES) {
      for (const m of text.matchAll(re)) hits.push({ phrase, index: m.index, length: m[0].length });
    }
    hits.sort((a, b) => a.index - b.index);
    // drop overlapping matches (keep the first/longest at a position)
    const clean = [];
    let end = -1;
    for (const h of hits) {
      if (h.index >= end) { clean.push(h); end = h.index + h.length; }
    }
    const lens = ss.map((s) => words(s).length);
    const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
    const sd = lens.length > 1 ? Math.sqrt(lens.reduce((a, l) => a + (l - mean) ** 2, 0) / lens.length) : 0;
    const burstiness = mean ? sd / mean : 0; // coefficient of variation
    const emDashes = (text.match(/—/g) || []).length;
    const transitionStarts = ss.filter((s) => TRANSITIONS.test(s)).length;
    const per100 = ws.length ? (clean.length / ws.length) * 100 : 0;
    const sample = ws.slice(0, 200).map((w) => w.toLowerCase());
    const ttr = sample.length ? new Set(sample).size / sample.length : 0;

    const rows = [
      { label: "Stock AI phrases", value: `${clean.length} (${round(per100, 1)} per 100 words)`, flag: per100 >= 2 ? "high" : per100 >= 0.8 ? "mid" : "low" },
      { label: "Sentence-length variety", value: ss.length > 2 ? `${round(burstiness, 2)} (higher = more varied)` : "too short to measure", flag: ss.length <= 2 ? "na" : burstiness < 0.3 ? "high" : burstiness < 0.45 ? "mid" : "low" },
      { label: "Transition-word openers", value: `${transitionStarts} of ${ss.length} sentences`, flag: ss.length && transitionStarts / ss.length > 0.25 ? "high" : transitionStarts / (ss.length || 1) > 0.12 ? "mid" : "low" },
      { label: "Em dashes", value: `${emDashes}`, flag: ws.length && emDashes / ws.length > 0.02 ? "high" : emDashes >= 2 ? "mid" : "low" },
      { label: "Vocabulary variety (first 200 words)", value: sample.length >= 50 ? `${round(ttr * 100, 0)}% unique` : "too short to measure", flag: "na" },
    ];
    const ENGLISH_ONLY = ["Stock AI phrases", "Transition-word openers"];
    return { hits: english ? clean : [], rows: english ? rows : rows.filter((r) => !ENGLISH_ONLY.includes(r.label)), perHundred: english ? round(per100, 1) : 0 };
  }


  // ---------- tone signals (local heuristics for emails / messages) ----------
  const TONE_GROUPS = [
    { id: "hedge", label: "Hedging / softeners", phrases: ["just", "maybe", "perhaps", "i think", "i guess", "sorry", "kind of", "sort of", "i was wondering", "if possible", "if you don't mind", "no worries"] },
    { id: "passive", label: "Possible passive-aggressive phrasing", phrases: ["per my last email", "as previously mentioned", "as i mentioned", "as i said", "as per", "going forward", "with all due respect", "i'm surprised", "kindly note", "please be advised", "as discussed", "friendly reminder", "not sure if you saw", "once again", "as you know"] },
    { id: "demand", label: "Demanding / urgent wording", phrases: ["immediately", "asap", "urgent", "urgently", "right away", "you must", "you need to", "i need you to", "do not", "failure to", "unacceptable"] },
    { id: "polite", label: "Politeness markers", phrases: ["please", "thanks", "thank you", "appreciate", "grateful", "happy to", "would you mind", "could you"] },
  ];
  const TONE_RES = TONE_GROUPS.map((g) => ({
    ...g,
    res: g.phrases.map((p) => ({
      phrase: p,
      re: new RegExp("(?<![\\p{L}])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]") + "(?![\\p{L}])", "giu"),
    })),
  }));

  function toneSignals(text) {
    const groups = TONE_RES.map((g) => {
      const found = [];
      for (const { phrase, re } of g.res) for (const m of text.matchAll(re)) found.push({ phrase, index: m.index, length: m[0].length });
      return { id: g.id, label: g.label, count: found.length, phrases: [...new Set(found.map((f) => f.phrase))], hits: found };
    });
    const ws = words(text);
    const caps = ws.filter((w) => w.length >= 4 && w === w.toUpperCase() && /\p{L}/u.test(w)).length;
    const exclaims = (text.match(/!/g) || []).length;
    const questions = (text.match(/\?/g) || []).length;
    const hits = groups.flatMap((g) => g.hits.map((h) => ({ ...h, group: g.id }))).sort((a, b) => a.index - b.index);
    const clean = [];
    let end = -1;
    for (const h of hits) if (h.index >= end) { clean.push(h); end = h.index + h.length; }
    return { groups, caps, exclaims, questions, words: ws.length, hits: clean };
  }


  // ---------- language detection (local, free, approximate) ----------
  const LANG_NAMES = {
    en: "English", hi: "Hindi", mr: "Marathi", gu: "Gujarati", ta: "Tamil", te: "Telugu", bn: "Bengali", kn: "Kannada",
    ml: "Malayalam", pa: "Punjabi", ur: "Urdu", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian",
    ar: "Arabic", ja: "Japanese", zh: "Chinese", ko: "Korean", ru: "Russian", "hi-Latn": "Hinglish (Hindi in Latin script)",
    und: "Unknown language",
  };
  const SCRIPT_RANGES = [
    ["Devanagari", /[ऀ-ॿ]/g, "hi"], ["Bengali", /[ঀ-৿]/g, "bn"], ["Gurmukhi", /[਀-੿]/g, "pa"],
    ["Gujarati", /[઀-૿]/g, "gu"], ["Tamil", /[஀-௿]/g, "ta"], ["Telugu", /[ఀ-౿]/g, "te"],
    ["Kannada", /[ಀ-೿]/g, "kn"], ["Malayalam", /[ഀ-ൿ]/g, "ml"], ["Arabic", /[؀-ۿݐ-ݿ]/g, "ar"],
    ["Cyrillic", /[Ѐ-ӿ]/g, "ru"], ["Hangul", /[가-힯ᄀ-ᇿ]/g, "ko"],
    ["Kana", /[぀-ヿ]/g, "ja"], ["Han", /[一-鿿]/g, "zh"], ["Latin", /[A-Za-zÀ-ɏ]/g, "und"],
  ];
  const LATIN_STOP = {
    en: "the and of to is that it for with was are this be have you not they but from".split(" "),
    es: "el los las y por para como más una del pero está esto sus también".split(" "),
    fr: "le les des du est une qui dans pas sur avec ce il et nous vous sont être".split(" "),
    de: "der die das und ist nicht ein eine mit von den auf für ich sie wir auch sich".split(" "),
    pt: "os não para com uma mais é você são também isso ele ela mas muito".split(" "),
    it: "il gli che per non con della è sono questo anche più nel suo come".split(" "),
    "hi-Latn": "hai hain nahi nahin kya hum aap mera meri tum kar karo ke ki ko bhi toh tha thi mein yeh woh aur lekin kuch bahut accha theek kyun abhi".split(" "),
  };
  const LATIN_SETS = Object.fromEntries(Object.entries(LATIN_STOP).map(([k, v]) => [k, new Set(v)]));
  const HI_MARK = new Set("है हैं और में का की के को नहीं यह था थी".split(" "));
  const MR_MARK = new Set("आहे आहेत आणि मध्ये नाही हे ते होते केले".split(" "));
  const UR_MARK = new Set("ہے ہیں کے کی اور نہیں کو سے".split(" "));
  const AR_MARK = new Set("في من على إلى أن هذا هذه التي الذي ما".split(" "));

  /** Returns { code, name, script, share, confidence, isEnglish, mixed }. Approximate by design. */
  function detectLanguage(text) {
    const counts = SCRIPT_RANGES.map(([script, re, code]) => ({ script, code, n: (text.match(re) || []).length }));
    const total = counts.reduce((a, c) => a + c.n, 0);
    const out = (code, script, share, confidence, mixed = false) => ({
      code, name: LANG_NAMES[code] || LANG_NAMES.und, script, share: round(share, 2), confidence, isEnglish: code === "en", mixed,
    });
    if (total < 3) return out("und", "", 0, "low");

    const kana = counts.find((c) => c.script === "Kana").n;
    const han = counts.find((c) => c.script === "Han").n;
    let top = counts.reduce((a, c) => (c.n > a.n ? c : a));
    if (kana && kana + han >= top.n) top = { script: "Kana", code: "ja", n: kana + han };
    const share = top.n / total;
    const mixed = share < 0.85;
    const conf = share >= 0.85 ? "high" : share >= 0.6 ? "medium" : "low";
    const toks = text.split(/[\s.,;:!?।॥"'()\[\]{}«»“”‘’—-]+/).filter(Boolean);

    if (top.script === "Devanagari") {
      const mr = toks.filter((t) => MR_MARK.has(t)).length, hi = toks.filter((t) => HI_MARK.has(t)).length;
      return out(mr > hi ? "mr" : "hi", "Devanagari", share, mr === hi ? "low" : conf, mixed);
    }
    if (top.script === "Arabic") {
      const urLetters = (text.match(/[ٹڈڑںھہے]/g) || []).length;
      const ur = toks.filter((t) => UR_MARK.has(t)).length + urLetters, ar = toks.filter((t) => AR_MARK.has(t)).length;
      return out(ur > ar ? "ur" : "ar", "Arabic", share, ur === ar ? "low" : conf, mixed);
    }
    if (top.script !== "Latin") return out(top.code, top.script, share, conf, mixed);

    // Latin script: score stopword coverage per language.
    const lower = toks.map((t) => t.toLowerCase());
    if (lower.length < 4) return out("und", "Latin", share, "low", mixed);
    const scored = Object.entries(LATIN_SETS)
      .map(([code, set]) => [code, lower.filter((t) => set.has(t)).length / lower.length])
      .sort((a, b) => b[1] - a[1]);
    const [best, bestScore] = scored[0];
    const second = scored[1][1];
    if (bestScore < 0.1 || bestScore - second < 0.03) return out("und", "Latin", share, "low", mixed);
    const c = bestScore >= 0.2 && lower.length >= 12 ? "high" : "medium";
    return out(best, "Latin", share, mixed ? "low" : c, mixed);
  }


  // ---------- chunking for long documents ----------
  /** Splits on paragraph boundaries (then sentences, then hard cuts) into pieces of at most `max` chars. */
  function chunkText(text, max = 5800) {
    const pieces = [];
    for (const para of text.split(/\n{2,}/)) {
      if (para.length <= max) { pieces.push(para); continue; }
      let cur = "";
      const flush = () => { if (cur) { pieces.push(cur); cur = ""; } };
      for (const sent of para.split(/(?<=[.!?…।॥])\s+|(?<=[。！？])/).filter(Boolean)) {
        if (sent.length > max) {
          flush();
          for (let i = 0; i < sent.length; i += max) pieces.push(sent.slice(i, i + max));
        } else if (cur && cur.length + 1 + sent.length > max) { flush(); cur = sent; }
        else cur = cur ? cur + " " + sent : sent;
      }
      flush();
    }
    const chunks = [];
    let cur = "";
    for (const piece of pieces) {
      const joined = cur ? cur + "\n\n" + piece : piece;
      if (cur && joined.length > max) { chunks.push(cur); cur = piece; } else cur = joined;
    }
    if (cur) chunks.push(cur);
    return chunks.map((c) => c.trim()).filter(Boolean);
  }

  // ---------- word diff ----------
  function diffWords(a, b) {
    const A = a.match(/\S+|\s+/g) || [];
    const B = b.match(/\S+|\s+/g) || [];
    const key = (t) => (/^\s/.test(t) ? " " : t);
    let s = 0;
    while (s < A.length && s < B.length && key(A[s]) === key(B[s])) s++;
    let ea = A.length, eb = B.length;
    while (ea > s && eb > s && key(A[ea - 1]) === key(B[eb - 1])) { ea--; eb--; }
    const a2 = A.slice(s, ea), b2 = B.slice(s, eb);
    const ops = [];
    const push = (type, text) => {
      if (!text) return;
      const last = ops[ops.length - 1];
      if (last && last.type === type) last.text += text; else ops.push({ type, text });
    };
    push("eq", A.slice(0, s).join(""));
    const n = a2.length, m = b2.length;
    if (n * m > 9e6) {
      push("del", a2.join(""));
      push("ins", b2.join(""));
    } else {
      const w = m + 1;
      const dp = new Uint16Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          dp[i * w + j] = key(a2[i]) === key(b2[j]) ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (key(a2[i]) === key(b2[j])) { push("eq", b2[j]); i++; j++; }
        else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { push("del", a2[i]); i++; }
        else { push("ins", b2[j]); j++; }
      }
      while (i < n) push("del", a2[i++]);
      while (j < m) push("ins", b2[j++]);
    }
    push("eq", A.slice(ea).join(""));
    return ops;
  }

  function diffSummary(ops) {
    const count = (type) => ops.filter((o) => o.type === type).reduce((n, o) => n + words(o.text).length, 0);
    const kept = count("eq"), removed = count("del"), added = count("ins");
    const base = kept + removed;
    return { kept, removed, added, changedPct: base ? round(((removed + added) / (base + added)) * 100, 0) : 0 };
  }

  // ---------- cleaners ----------
  const tokens = (line) =>
    line.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const perLine = (fn) => (t) => t.split("\n").map(fn).join("\n");
  const SMALL = new Set("a an and as at but by for from in nor of on or per the to via vs with".split(" "));
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

  const slug = (t) =>
    t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const uniq = (arr) => [...new Set(arr)];

  const OPS = {
    // case
    upper: (t) => t.toUpperCase(),
    lower: (t) => t.toLowerCase(),
    title: perLine((l) => {
      const parts = l.toLowerCase().split(/(\s+)/);
      const idx = parts.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i >= 0);
      return parts.map((p, i) => (!/\S/.test(p) ? p : i === idx[0] || i === idx[idx.length - 1] || !SMALL.has(p) ? cap(p) : p)).join("");
    }),
    sentence: (t) =>
      t.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{Ll})/gu, (m, p, c) => p + c.toUpperCase()).replace(/\bi\b/g, "I"),
    camel: perLine((l) => tokens(l).map((w, i) => (i ? cap(w.toLowerCase()) : w.toLowerCase())).join("")),
    pascal: perLine((l) => tokens(l).map((w) => cap(w.toLowerCase())).join("")),
    snake: perLine((l) => tokens(l).map((w) => w.toLowerCase()).join("_")),
    kebab: perLine((l) => tokens(l).map((w) => w.toLowerCase()).join("-")),
    constant: perLine((l) => tokens(l).map((w) => w.toUpperCase()).join("_")),
    slug: perLine(slug),
    // whitespace & punctuation
    trimLines: perLine((l) => l.trim()),
    collapseSpaces: perLine((l) => l.replace(/[ \t\u00a0]+/g, " ").trim()),
    removeBlankLines: (t) => t.split("\n").filter((l) => l.trim()).join("\n"),
    unwrap: (t) => t.replace(/(?<!\n)[ \t]*\n[ \t]*(?!\n)/g, " "),
    removeBreaks: (t) => t.replace(/\s*\n+\s*/g, " ").trim(),
    straightQuotes: (t) => t.replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/…/g, "...").replace(/\u00a0/g, " "),
    emDashes: (t) => t.replace(/\s*—\s*/g, ", "),
    invisible: (t) => t.replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, ""),
    stripHtml: (t) =>
      t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim(),
    stripMarkdown: (t) =>
      t.replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "")).replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^>\s?/gm, "")
        .replace(/(\*\*|__)(.*?)\1/g, "$2").replace(/(\*|_)(.*?)\1/g, "$2").replace(/`([^`]+)`/g, "$1"),
    // lines
    sortAZ: (t) => t.split("\n").sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })).join("\n"),
    sortZA: (t) => t.split("\n").sort((a, b) => b.localeCompare(a, undefined, { sensitivity: "base", numeric: true })).join("\n"),
    sortLen: (t) => t.split("\n").sort((a, b) => a.length - b.length).join("\n"),
    dedupe: (t) => uniq(t.split("\n")).join("\n"),
    reverse: (t) => t.split("\n").reverse().join("\n"),
    shuffle: (t) => {
      const a = t.split("\n");
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a.join("\n");
    },
    numberLines: (t) => t.split("\n").map((l, i) => `${i + 1}. ${l}`).join("\n"),
    // extract
    emails: (t) => uniq(t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).join("\n"),
    urls: (t) => uniq((t.match(/https?:\/\/[^\s<>"')]+/g) || []).map((u) => u.replace(/[.,;:!?]+$/, ""))).join("\n"),
    numbers: (t) => (t.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).join("\n"),
    hashtags: (t) => uniq(t.match(/#[\p{L}\p{N}_]+/gu) || []).join("\n"),
  };

  function findReplace(text, find, replace, { regex = false, caseSensitive = false } = {}) {
    if (!find) return { text, count: 0 };
    const src = regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(src, caseSensitive ? "gu" : "giu");
    let count = 0;
    const out = text.replace(re, (...args) => {
      count++;
      return regex ? replace.replace(/\$(\d+|&)/g, (_, g) => (g === "&" ? args[0] : args[Number(g)] ?? "")) : replace;
    });
    return { text: out, count };
  }

  root.TextLib = { chunkText, detectLanguage, LANG_NAMES, toneSignals, words, sentences, paragraphs, syllables, stats, frequency, limits, aiSignals, diffWords, diffSummary, OPS, findReplace, STOP };
})(typeof globalThis !== "undefined" ? globalThis : window);
