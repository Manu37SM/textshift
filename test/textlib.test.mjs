import assert from "node:assert/strict";
import test from "node:test";
import "../public/textlib.js";
const T = globalThis.TextLib;

test("stats basics", () => {
  const s = T.stats("The cat sat. The dog ran fast!\n\nA new paragraph here.");
  assert.equal(s.words, 11);
  assert.equal(s.sentences, 3);
  assert.equal(s.paragraphs, 2);
  assert.ok(s.flesch > 60);
});
test("empty text is safe", () => {
  const s = T.stats("");
  assert.equal(s.words, 0);
  assert.equal(s.flesch, 0);
  assert.deepEqual(T.diffWords("", ""), []);
});
test("syllables", () => {
  assert.equal(T.syllables("cat"), 1);
  assert.equal(T.syllables("water"), 2);
  assert.equal(T.syllables("beautiful"), 3);
});
test("diff finds insert and delete", () => {
  const ops = T.diffWords("the quick brown fox", "the slow brown fox jumps");
  const text = (t) => ops.filter((o) => o.type === t).map((o) => o.text.trim()).join("|");
  assert.equal(text("del"), "quick");
  assert.equal(text("ins"), "slow|jumps");
  assert.equal(ops.map((o) => o.text).join("").replace(/\s+/g, " "), "the quickslow brown fox jumps".replace("quickslow", "quick" + "slow"));
});
test("diff identical → one eq op", () => {
  const ops = T.diffWords("same text", "same text");
  assert.deepEqual(ops, [{ type: "eq", text: "same text" }]);
});
test("ai signals flags stock phrases, not substrings", () => {
  const r = T.aiSignals("Moreover, we delve into the rich tapestry. It's a robust, seamless landscape.");
  const found = r.hits.map((h) => h.phrase);
  assert.ok(found.includes("delve") && found.includes("moreover") && found.includes("robust"));
  assert.equal(T.aiSignals("The undelved cave was fine.").hits.length, 0);
});
test("case converters", () => {
  const O = T.OPS;
  assert.equal(O.title("the lord of the rings"), "The Lord of the Rings");
  assert.equal(O.camel("hello big world"), "helloBigWorld");
  assert.equal(O.snake("Hello Big-World"), "hello_big_world");
  assert.equal(O.kebab("helloBigWorld"), "hello-big-world");
  assert.equal(O.slug("Crème Brûlée & Co!"), "creme-brulee-co");
  assert.equal(O.sentence("hello there. i am here! ok"), "Hello there. I am here! Ok");
});
test("cleaners", () => {
  const O = T.OPS;
  assert.equal(O.dedupe("a\nb\na\nc"), "a\nb\nc");
  assert.equal(O.unwrap("one\ntwo\n\nthree"), "one two\n\nthree");
  assert.equal(O.stripHtml("<p>Hi <b>there</b> &amp; you</p><script>x()</script>"), "Hi there & you");
  assert.equal(O.invisible("a\u200Bb"), "ab");
  assert.equal(O.emDashes("one — two"), "one, two");
  assert.equal(O.stripMarkdown("# Title\n**bold** [link](http://x.y)"), "Title\nbold link");
  assert.equal(O.emails("a@b.com, c@d.org a@b.com"), "a@b.com\nc@d.org");
  assert.equal(O.urls("see https://x.com/a, and https://x.com/a."), "https://x.com/a");
});
test("find/replace literal and regex", () => {
  assert.deepEqual(T.findReplace("a.b a.b", ".", "-"), { text: "a-b a-b", count: 2 });
  assert.deepEqual(T.findReplace("Cat cat", "cat", "dog"), { text: "dog dog", count: 2 });
  assert.deepEqual(T.findReplace("x12 y34", "(\\w)(\\d+)", "$2$1", { regex: true }), { text: "12x 34y", count: 2 });
});
test("frequency skips stop words", () => {
  const f = T.frequency("apple banana apple the the the apple", { n: 1 });
  assert.equal(f[0].term, "apple");
  assert.ok(!f.some((x) => x.term === "the"));
});
test("limits counts X urls as 23", () => {
  const l = T.limits("hi https://example.com/very/long/path/here/ok");
  assert.equal(l.find((x) => x.name.startsWith("X")).count, 3 + 23);
});

test("tone signals", () => {
  const t = T.toneSignals("Per my last email, I need you to send this ASAP!! Thanks, just checking. URGENT matters.");
  const by = Object.fromEntries(t.groups.map((g) => [g.id, g]));
  assert.ok(by.passive.phrases.includes("per my last email"));
  assert.ok(by.demand.phrases.includes("asap") && by.demand.phrases.includes("i need you to"));
  assert.ok(by.polite.phrases.includes("thanks"));
  assert.ok(by.hedge.phrases.includes("just"));
  assert.equal(t.exclaims, 2);
  assert.equal(t.caps, 2); // ASAP, URGENT
  assert.equal(T.toneSignals("justice for all").groups.find((g) => g.id === "hedge").count, 0);
});

test("language detection", () => {
  const d = (t) => T.detectLanguage(t).code;
  assert.equal(d("The quick brown fox jumps over the lazy dog and it was not that far from the house."), "en");
  assert.equal(d("यह एक परीक्षण वाक्य है और यह हिंदी में लिखा गया है।"), "hi");
  assert.equal(d("हे एक चाचणी वाक्य आहे आणि ते मराठी मध्ये लिहिले आहे."), "mr");
  assert.equal(d("இது ஒரு சோதனை வாக்கியம் ஆகும்."), "ta");
  assert.equal(d("ఇది ఒక పరీక్ష వాక్యం."), "te");
  assert.equal(d("El perro y los gatos están en la casa para comer también."), "es");
  assert.equal(d("Le chat est dans la maison et nous sommes avec vous pour le dîner."), "fr");
  assert.equal(d("Der Hund ist nicht hier und ich habe auch keine Zeit für die Sache."), "de");
  assert.equal(d("Mera naam Manish hai aur main Mumbai mein rehta hoon, kya aap bhi aaoge?"), "hi-Latn");
  assert.equal(d("これは日本語のテストです。"), "ja");
  assert.equal(d("这是一个中文测试句子。"), "zh");
  assert.equal(d("이것은 한국어 테스트 문장입니다."), "ko");
  assert.equal(d("Это тестовое предложение на русском языке."), "ru");
  assert.equal(d("هذا اختبار في اللغة العربية من أجل هذه التجربة"), "ar");
  assert.equal(d("یہ ایک ٹیسٹ جملہ ہے اور اردو میں لکھا گیا ہے۔"), "ur");
  assert.equal(d(""), "und");
  assert.equal(d("ok"), "und");
  assert.equal(T.detectLanguage("hello world this is english text, ok.").isEnglish, true);
  assert.equal(T.detectLanguage("This is English with some हिंदी words mixed in here today").code, "en");
});

test("chunkText: short text is one chunk", () => {
  assert.deepEqual(T.chunkText("Hello there.\n\nSecond paragraph."), ["Hello there.\n\nSecond paragraph."]);
  assert.deepEqual(T.chunkText(""), []);
});
test("chunkText: respects max and loses no words", () => {
  const para = (n) => Array.from({ length: 40 }, (_, i) => `Sentence ${n}-${i} is here.`).join(" ");
  const text = [para(1), para(2), para(3), para(4)].join("\n\n"); // ~4.5k chars
  const chunks = T.chunkText(text, 1500);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.length <= 1500), chunks.map((c) => c.length).join());
  const words = (t) => t.split(/\s+/).filter(Boolean).length;
  assert.equal(chunks.reduce((n, c) => n + words(c), 0), words(text));
});
test("chunkText: hard-cuts one giant unbroken run and splits Hindi/CJK sentences", () => {
  assert.ok(T.chunkText("a".repeat(5000), 2000).every((c) => c.length <= 2000));
  const hi = Array.from({ length: 300 }, () => "यह एक वाक्य है।").join(" ");
  const c = T.chunkText(hi, 1000);
  assert.ok(c.length > 1 && c.every((x) => x.length <= 1000));
  const zh = "这是一个句子。".repeat(400);
  assert.ok(T.chunkText(zh, 500).every((x) => x.length <= 500));
});
test("sentences handle danda and CJK full stop", () => {
  assert.equal(T.sentences("यह पहला है। यह दूसरा है।").length, 2);
  assert.equal(T.sentences("这是第一句。这是第二句。").length, 2);
});
