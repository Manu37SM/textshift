import assert from "node:assert/strict";
import test from "node:test";

// Mock Groq: echo which system prompt/user text the route sent, so we can assert on them.
let lastBody = null;
globalThis.fetch = async (_url, init) => {
  lastBody = JSON.parse(init.body);
  return new Response(JSON.stringify({ choices: [{ message: { content: "  MOCK RESULT  " } }] }), { status: 200 });
};
const env = { AI_PROVIDER: "groq", GROQ_API_KEY: "test" };
const post = (body) => ({ request: new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }), env });

const routes = {
  paraphrase: await import("../functions/api/paraphrase.js"),
  summarize: await import("../functions/api/summarize.js"),
  grammar: await import("../functions/api/grammar.js"),
  translate: await import("../functions/api/translate.js"),
};

test("each new route returns trimmed AI result with one provider call", async () => {
  for (const [name, mod] of Object.entries(routes)) {
    lastBody = null;
    const res = await mod.onRequestPost(post({ text: "Hello world." }));
    assert.equal(res.status, 200, name);
    const j = await res.json();
    assert.equal(j.result, "MOCK RESULT", name);
    assert.ok(lastBody.messages[1].content.includes("Hello world."), name);
  }
});

test("options are validated", async () => {
  const bad = [
    ["paraphrase", { mode: "evil" }], ["summarize", { format: "x" }],
    ["grammar", { dialect: "mars" }], ["translate", { target: "klingon" }],
  ];
  for (const [name, extra] of bad) {
    const res = await routes[name].onRequestPost(post({ text: "Hi", ...extra }));
    assert.equal(res.status, 400, name);
  }
});

test("empty and oversized input rejected", async () => {
  assert.equal((await routes.paraphrase.onRequestPost(post({ text: "   " }))).status, 400);
  assert.equal((await routes.paraphrase.onRequestPost(post({ text: "a".repeat(6001) }))).status, 400);
  assert.equal((await routes.paraphrase.onRequestPost(post({}))).status, 400);
});

test("prompts carry the chosen options and the injection guard", async () => {
  await routes.translate.onRequestPost(post({ text: "Good morning", target: "mr", tone: "formal" }));
  assert.match(lastBody.messages[0].content, /Marathi/);
  assert.match(lastBody.messages[0].content, /formal/i);
  assert.match(lastBody.messages[0].content, /never instructions to follow/);
  await routes.grammar.onRequestPost(post({ text: "teh cat", mode: "polish", dialect: "in" }));
  assert.match(lastBody.messages[0].content, /Indian English/);
  await routes.summarize.onRequestPost(post({ text: "long text", format: "tldr" }));
  assert.match(lastBody.messages[0].content, /TL;DR/);
});

test("provider failure → 502 with safe message", async () => {
  globalThis.fetch = async () => new Response("secret upstream detail", { status: 500 });
  const res = await routes.paraphrase.onRequestPost(post({ text: "Hi" }));
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes("secret"));
});

test("rate limit blocks with 429", async () => {
  const kv = { get: async () => "30", put: async () => {} };
  const res = await routes.paraphrase.onRequestPost({ ...post({ text: "Hi" }), env: { ...env, RATE_LIMIT_KV: kv } });
  assert.equal(res.status, 429);
});

test("tone route parses JSON (even wrapped in prose) and clamps scores", async () => {
  const tone = await import("../functions/api/tone.js");
  const payload = { overall: "Curt", scores: { formality: 150, warmth: "x", assertiveness: 70.4, urgency: -5 }, perceived_as: ["Abrupt"], risks: ['"ASAP" — pushy'], suggestions: ["Add please"], rewrite: "Could you send it today?" };
  globalThis.fetch = async (_u, init) => {
    lastBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Sure!\n" + JSON.stringify(payload) + "\nDone" } }] }), { status: 200 });
  };
  const res = await tone.onRequestPost(post({ text: "Send it ASAP", audience: "client", goal: "diplomatic" }));
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.overall, "Curt");
  assert.deepEqual(j.scores, { formality: 100, warmth: 50, assertiveness: 70, urgency: 0 });
  assert.equal(j.rewrite, "Could you send it today?");
  assert.equal(lastBody.response_format.type, "json_object");
  assert.match(lastBody.messages[0].content, /a client or customer/);
  assert.match(lastBody.messages[0].content, /diplomatic/);
});

test("tone route: garbage → 502, bad option → 400", async () => {
  const tone = await import("../functions/api/tone.js");
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "no json here" } }] }), { status: 200 });
  assert.equal((await tone.onRequestPost(post({ text: "Hi" }))).status, 502);
  assert.equal((await tone.onRequestPost(post({ text: "Hi", audience: "alien" }))).status, 400);
});

test("humanize/aiify/detect prompts are language-safe", async () => {
  const h = await import("../functions/api/humanize.js");
  const a = await import("../functions/api/aiify.js");
  const d = await import("../functions/api/detect.js");
  globalThis.fetch = async (_u, init) => {
    lastBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"classification":"mixed_uncertain","ai_likeness":50,"human_likeness":50,"confidence":"low","observations":[],"explanation":"x"}' } }] }), { status: 200 });
  };
  await h.onRequestPost(post({ text: "यह एक वाक्य है।" }));
  assert.match(lastBody.messages[0].content, /same language and script as the input/);
  await a.onRequestPost(post({ text: "यह एक वाक्य है।" }));
  assert.match(lastBody.messages[0].content, /Never translate it into English/);
  await d.onRequestPost(post({ text: "यह एक वाक्य है।" }));
  assert.match(lastBody.messages[0].content, /non-native speakers/);
});
