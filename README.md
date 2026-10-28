# TextShift

AI ↔ Human rewriting, a probabilistic AI-text detector, and a before/after comparison
tool. Built to run at **₹0** using free tiers and open-source software only.

---

## 1. Architecture decision (read this before deploying)

| Layer | Choice | Why |
|---|---|---|
| Frontend hosting | **Cloudflare Pages** | Free, unlimited static requests, no card required, no build step needed (plain HTML/CSS/JS). |
| Backend | **Cloudflare Pages Functions** | Serverless functions colocated with the frontend on the same domain — no CORS headaches, one dashboard, one deploy. |
| Primary AI | **Groq** (Llama 3.3 70B) | Best free rate limit of any hosted provider we checked (see table below), OpenAI-compatible API, fast. |
| Secondary/fallback AI | **Cloudflare Workers AI** | Already part of your Cloudflare account (no second signup), native binding, used only if Groq errors. |
| Local/offline AI | **Ollama** | Genuinely free forever, runs on your machine, used for local dev or if you self-host later. |
| Rate limiting | **Cloudflare KV** | Free tier is enough for a low-traffic personal tool; used to cap requests per IP per day. |
| Database | **None** | Not needed — no history is stored, by design (see Privacy below). |

This matches the required flow: **Frontend → Backend → AI Provider**, with the API key
(Groq's) held only as a Cloudflare Pages environment secret, never shipped to the browser.

### Free-tier facts — verify before you rely on them

Free tiers change without notice. Re-check these at the linked docs before depending on
them for anything real:

| Provider | Card required? | Current free limit (verify) | Type |
|---|---|---|---|
| Groq (console.groq.com) | No | ~30 req/min, ~14,400 req/day, Llama 3.3 70B | **Free tier** (ongoing, not a trial) |
| Cloudflare Workers AI | No | 10,000 "Neurons"/day, shared across all models, resets 00:00 UTC | **Free tier** (ongoing) |
| Cloudflare Pages | No | Unlimited static requests; Functions share the Workers free cap | **Free tier** (ongoing) |
| Cloudflare KV | No | ~100k reads/day, ~1k writes/day, 1GB storage | **Free tier** (ongoing) |
| Ollama | N/A — no account | Unlimited, limited only by your own hardware | **Local / open-source** |

None of these require a credit card to start. Groq and Cloudflare can change their free
tiers at any time — this is **free tier**, not **free forever**, except for Ollama, which
is genuinely free forever because it's your own machine.

Docs to re-check before deploying:
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare KV limits: https://developers.cloudflare.com/kv/platform/limits/

### Data handling — what each provider does with your text

- **Groq**: Groq's stated policy (check their current privacy policy yourself — this is
  not legal advice) is that it does not use API prompts/completions to train models.
  Commercial use of API output is generally permitted, but the underlying model (Llama
  3.3) carries Meta's own license terms — read them if you plan commercial use.
- **Cloudflare Workers AI**: runs on Cloudflare's infrastructure under Cloudflare's data
  processing terms; check their current documentation for retention specifics.
- **Ollama**: nothing leaves your machine.

TextShift itself never logs your submitted text (see Privacy, below) — but the moment
text is sent to a hosted provider, that provider's own policy governs what happens to it
in transit/processing. Tell your users this plainly if you deploy this publicly (the
footer in `public/index.html` already does).

### Provider abstraction (why you can add Claude/OpenAI/Gemini later)

Every API route calls `runAI(env, {...})` from `functions/_lib/providers/index.js`. That
function is the only place that knows which concrete provider is active. To add a paid
provider later:

1. Create `functions/_lib/providers/AnthropicProvider.js` implementing the same
   `chatComplete({system, user, maxTokens, temperature, json})` method as the existing providers.
2. Register it in the `REGISTRY` object in `functions/_lib/providers/index.js`.
3. Set `AI_PROVIDER=anthropic` (and its API key) as an environment variable.

Nothing in `functions/api/*.js` or the frontend changes.

---

## 2. Project structure

```
textshift/
├── functions/
│   ├── api/
│   │   ├── humanize.js      # POST /api/humanize  — AI → Human
│   │   ├── aiify.js         # POST /api/aiify      — Human → AI
│   │   ├── detect.js        # POST /api/detect     — Text Detector
│   │   └── compare.js       # POST /api/compare    — Compare / Analyze
│   └── _lib/
│       ├── providers/       # AIProvider interface + Groq/Workers AI/Ollama + factory
│       ├── prompts/         # Reusable system-prompt templates
│       ├── rateLimit.js     # Per-IP daily cap via Cloudflare KV
│       ├── validate.js      # Input validation, size limits
│       └── response.js      # JSON/CORS/error response helpers
├── public/                  # Static frontend (no build step)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── wrangler.toml             # Local dev config + binding declarations
├── package.json
└── .env.example
```

---

## 3. No-cost deployment plan (exact steps)

### Step 1 — Local development setup

```bash
git clone <your-fork-url> textshift
cd textshift
npm install          # installs wrangler (Cloudflare's free CLI) as a dev dependency
```

Create a `.dev.vars` file (git-ignored) for local secrets — copy `.env.example`:

```bash
cp .env.example .dev.vars
```

Edit `.dev.vars` and set at least `GROQ_API_KEY` (see Step 5).

### Step 2 — Git repository setup

```bash
git init
git add .
git commit -m "Initial TextShift commit"
```

Push to a **free** GitHub repository (public or private — both are free on GitHub for
individuals).

### Step 3 — Get a free Groq API key (Step 5 detail, do this now)

1. Go to https://console.groq.com and sign up (no credit card).
2. Create an API key under "API Keys".
3. Copy it into `.dev.vars` as `GROQ_API_KEY=...` for local testing.

### Step 4 — Local test run

```bash
npx wrangler kv namespace create RATE_LIMIT_KV
```

Paste the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`. Then:

```bash
npm run dev
```

This serves the site (default `http://localhost:8788`) with the Functions running
locally, Workers AI reachable via the `--ai AI` flag, and KV bound. Open the URL, try all
four tabs.

To test the local-model fallback instead of Groq: install Ollama
(https://ollama.com), run `ollama pull llama3.1`, then set `AI_PROVIDER=ollama` in
`.dev.vars` and restart `npm run dev`.

### Step 5 — Free frontend + backend deployment (same step, since both live on Pages)

```bash
npx wrangler login
npm run deploy
```

Or connect the GitHub repo directly in the Cloudflare dashboard (Workers & Pages →
Create → Pages → Connect to Git) for automatic deploys on every push — also free.

### Step 6 — Attach the AI binding and KV namespace in production

The `[ai]` and `[[kv_namespaces]]` blocks in `wrangler.toml` configure *local* dev. For
the deployed Pages project, go to:

Cloudflare dashboard → Workers & Pages → **textshift** → Settings → Functions:
- Under **KV namespace bindings**, add `RATE_LIMIT_KV` → your namespace.
- Under **AI bindings**, add `AI` → (Workers AI, no extra config needed).

### Step 7 — Environment variables / secrets

Same page, under **Environment variables**:
- `GROQ_API_KEY` — mark as **secret** (encrypted, never shown again).
- `AI_PROVIDER=groq`
- `FALLBACK_AI_PROVIDER=workers-ai`
- `MAX_INPUT_CHARS=6000`
- `MAX_REQUESTS_PER_IP_PER_DAY=30`
- `ALLOWED_ORIGIN=https://textshift.pages.dev` (or your real domain)

Redeploy after changing environment variables (Cloudflare prompts you to).

### Step 8 — Free subdomain

Cloudflare Pages gives every project a free subdomain automatically:
`https://textshift.pages.dev` (or `https://<your-project-name>.pages.dev`). No domain
purchase needed. If you already own a domain and want to attach it, Cloudflare Pages
supports free custom-domain attachment too — but that's optional, not required.

### Step 9 — Production configuration checklist

- [ ] `ALLOWED_ORIGIN` set to your real `.pages.dev` URL (not `*`) once you know it.
- [ ] `GROQ_API_KEY` stored as a **secret**, not a plain variable.
- [ ] KV and AI bindings attached (Step 6).
- [ ] Confirm `.dev.vars` and `.env` are **not** committed (`.gitignore` already excludes them).

### Step 10 — Rate limiting (already built in)

`functions/_lib/rateLimit.js` caps each IP to `MAX_REQUESTS_PER_IP_PER_DAY` (default 30)
requests per endpoint per day, using Cloudflare KV. This is the main defense against
one user accidentally burning your whole daily Groq/Workers AI quota.

### Step 11 — Usage monitoring without paid analytics

- **Cloudflare dashboard** (free): Workers & Pages → your project → Metrics shows
  request counts, errors, and CPU time at no cost.
- **Groq console** (free): shows your API usage against the daily/rate limits.
- **Cloudflare Workers AI dashboard** (free): shows Neuron usage for the day.

No paid analytics service is required or used.

---

## 4. Cost protection built into the code

- One AI request per humanize/aiify/detect call; the Compare endpoint makes exactly
  two (one detector call per text) — never more.
- No automatic retries on failure. A configured fallback provider is tried **at most
  once**, only if the primary provider errors outright.
- Hard input-length cap (`MAX_INPUT_CHARS`, default 6000 characters) and request-size
  cap (`MAX_REQUEST_BYTES`, default 64KB), enforced server-side regardless of what the
  frontend sends.
- Per-IP daily request cap via KV (Step 10).
- Explicit timeouts on outbound provider calls (20s) so a hung request can't tie up
  your Function invocation quota.

## 5. Privacy

- No database. No transformation history is stored anywhere.
- Submitted text is never written to logs by this application's own code.
- Text is sent only to whichever AI provider is configured, only for the duration of
  that one request, to perform the transformation you asked for.
- The frontend footer discloses this to end users. If you deploy this publicly, keep
  that disclosure and update it if you change providers.

## 6. Known limitations of the free architecture

- **Daily quota is shared across all visitors.** With Groq's ~14,400 req/day cap and
  a per-IP limit of 30/day, this comfortably supports a small personal or demo
  deployment, not high traffic. If you outgrow it, the provider abstraction (Section 1)
  is what lets you add a paid provider without a rewrite.
- **Detector and Compare scores are estimates**, not proof of authorship — this is a
  deliberate design constraint (see the disclaimers embedded in the API responses and
  UI), not a limitation to "fix" later.
- **Workers AI fallback quality** may differ from Groq's — it's there for availability,
  not as a drop-in equal.

## 7. Tools (v2)

| Tool | Where it runs | AI requests |
|---|---|---|
| AI → Human, Human → AI | `/api/humanize`, `/api/aiify` | 1 |
| Paraphrase (8 modes), Grammar (proofread/polish, US/UK/Indian English), Summarize (bullets/TL;DR/paragraph/actions/simple), Translate (21 languages incl. Hindi, Marathi, Tamil) | `/api/paraphrase`, `/api/grammar`, `/api/summarize`, `/api/translate` | 1 each |
| Detector | `/api/detect` + local quick scan | 1 (AI) or 0 (quick scan) |
| Compare | local word diff + stats; optional `/api/compare` | 0 (free) or 2 (AI estimate) |
| Stats (counts, reading time, Flesch, keywords, platform limits) | browser only (`public/textlib.js`) | 0 |
| Cleaner (case, whitespace, sort/dedupe, extract, find & replace) | browser only | 0 |

Also: word-level "Show changes" diff on every rewrite, "Send to…" between tools, file open (.txt/.md),
local history (browser `localStorage` only, last 25), Ctrl/⌘+Enter to run, Alt+←/→ to switch tools, `#tab` deep links.

New AI endpoints are built with `functions/_lib/aiRoute.js`, so they get the same rate limit, validation and
single-call cost guard as the originals. Prompts live in `functions/_lib/prompts/tools.js`.

Run the local-library tests with `npm test`.

### Pipeline and Tone (v2.1)

- **Pipeline** — one click: rewrite (`/api/humanize`) → score before/after (`/api/compare`) → word-level diff. Reports
  honestly when the AI-likeness estimate did not improve and offers "Run again, stronger".
- **Tone** — `/api/tone` (1 AI call, JSON) returns a tone read, how it may land, risky phrases and a suggested rewrite
  (warmer / more direct / more formal / more diplomatic, for a colleague / manager / client / friend). A free local
  quick scan flags hedging, demanding and passive-aggressive phrasing.

### Other languages (v2.2)

The language is detected locally (script ranges + stopword scoring; Hindi/Marathi, Urdu/Arabic and Hinglish are told apart
heuristically, so very short or mixed text may be marked "unsure"). Detector, AI → Human and Pipeline show a language
badge, an **Input language** override, and a **Handling** choice:

| Handling | Detector | AI → Human / Pipeline | Extra AI requests |
|---|---|---|---|
| Keep original language (default) | analyzed in-language | rewritten in-language | 0 |
| Translate to English | translated first, then scored (banner + the translation is shown) | translate → rewrite in English → translate back to the source language | 1 (detector) / 2 (rewrite) |

Notes: translation smooths style cues, so detector scores on translated text are less reliable; the detector prompt is
also told not to treat plain or literal phrasing from non-native writers as evidence of AI. Back-translation is not
offered for Hinglish. English-only local checks (stock phrases, transitions, Flesch, tone phrases) are skipped for other
languages instead of giving misleading numbers. Humanize / Human → AI / Paraphrase prompts keep the input language.

### Auto (v2.3) — the default tab

Paste anything, in any language, up to ~30,000 characters.

- **Analyze** (1 AI request): detected language, reading stats, AI-likeness estimate, and a suggested next step
  (AI-like → Humanize is highlighted; human-like → Fix grammar; mixed → no push, read it yourself).
- **Then:** run Humanize, Structure, Paraphrase, Fix grammar, Summarize or Translate inline, with a diff, copy/download,
  **Use as input** (chain actions), **Check result** (before → after AI-likeness) and **Tune in full tool** (opens the
  matching tab with the text carried over).
- **Long text:** split on paragraph, then sentence boundaries into chunks of up to ~5,800 characters (`TextLib.chunkText`) and
  processed one request per chunk, in order. Summaries of several chunks get one extra merge request. Limit: 5 chunks;
  the page tells you the request count before you run. Analyze scores only the first chunk, and says so.
- The per-IP daily limit (default 30 per endpoint) applies per request, so a 5-chunk document uses 5 of them.

---

### Safety, privacy and polish (v2.4)

| Feature | What it does | Notes |
|---|---|---|
| **Privacy shield** (top bar, on by default) | Masks emails, phone numbers, Aadhaar-style 12-digit IDs, PAN, IFSC, card numbers (Luhn-checked) and IPv4 addresses with placeholders such as `[[EMAIL_1]]` before text leaves the browser, then restores them in the result. | Pattern-based only. **Names, addresses and free-form secrets are not masked.** If the model drops a placeholder you get a warning. Not applied to anything you paste into a non-AI tool. |
| **Meaning guard** | After a rewrite, checks that numbers, dates, links, emails and capitalised names survived. Lists what is missing or newly invented. | Heuristic. Translate uses a lighter check (no names); Summarize is skipped because dropping details is its job. |
| **My voice** | Paste a sample of your own writing; Humanize, Structure, Paraphrase, Grammar (polish) and Tone imitate its style, never its content. | Stored in your browser only (max 1,500 chars) and sent only with those requests while enabled. |
| **Fit to target** | Rewrites text to a character, word or reading-grade target (presets for X, SMS, SEO title, YouTube, Instagram, LinkedIn). The browser measures the result and retries once if it missed. | Reading grade is English only. |
| **Read aloud** | Listen/Stop on results, using the browser's own voices. | Needs a voice for the language installed on the device. |
| **Remembered settings** | Dropdown and checkbox choices persist per tool in `localStorage`. | |
| **Installable / offline** | `manifest.webmanifest` + `sw.js`. Local tools (Stats, Cleaner, quick scan, diff) open offline; AI tools say you are offline. | Network-first, so a new deploy shows up on the next load. `/api/*` is never cached. |
| **Requests-left meter** | Top-bar chip from the `X-RateLimit-Remaining` header. | Local tools never count. |

#### Turnstile bot protection (optional, recommended before sharing the link widely)

1. Cloudflare dashboard → **Turnstile** → **Add widget**, hostname `textshift.pages.dev` (plus your custom domain if any), mode **Managed**.
2. Pages project → Settings → Variables and Secrets (Production):
   - `TURNSTILE_SITE_KEY` as a plain **variable** (public, served by `GET /api/config`)
   - `TURNSTILE_SECRET_KEY` as an encrypted **secret**
3. Redeploy. With no secret set, verification is skipped and the site behaves as before.

Behaviour: every AI request carries an `X-Turnstile-Token`; the server verifies it **before** touching the KV quota, so bots don't burn your daily budget. If Cloudflare's verification endpoint is unreachable the request is refused (fail closed, HTTP 503), because failing open would silently disable the protection. The widget is `interaction-only`, so normal visitors see nothing.

If you manage settings through `wrangler.toml` (`pages_build_output_dir` is set), Cloudflare may treat that file as the source of truth for bindings and variables. Verify in the dashboard after the first deploy that the two Turnstile values and your KV/AI bindings are still present.

## 8. CI/CD and Dependabot

**`.github/workflows/ci-deploy.yml`**

| Trigger | What runs |
|---|---|
| Pull request (including Dependabot) | `npm ci` → `npm test` → syntax check → bundle all Pages Functions. **No deploy, no secrets.** |
| Push to `master` | The same checks, then **deploy to Cloudflare Pages**, then a smoke test (site returns 200, `/api/tone` answers OPTIONS 204). |
| Manual (`workflow_dispatch`) | Same as push to `master` (run it from the Actions tab). |

One-time setup (the deploy job skips with a warning until these exist, so the first push will not go red):

1. Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**, or a custom
   token with `Account → Cloudflare Pages → Edit`.
2. GitHub repo → Settings → Secrets and variables → Actions → add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Optional manual gate: Settings → Environments → `production` → add required reviewers. Every deploy then waits for approval.
4. Confirm the Pages project's **production branch** is `master` (Pages → textshift → Settings → Builds). The workflow
   deploys with `--branch=master`; if the project expects another branch, deploys land as previews.

Your `GROQ_API_KEY` and other secrets stay in Cloudflare; the workflow never touches them. After the first CI deploy,
check that the AI binding, KV binding and environment variables still behave as before. When a `wrangler.toml` with
`pages_build_output_dir` exists, Cloudflare treats the file as the source of truth for bindings and plain variables,
so confirm that in the dashboard (behaviour can change between Wrangler/Pages versions).

**`.github/dependabot.yml`** is deliberately conservative: weekly (Mon 06:00 IST), minor+patch updates grouped into one PR
per ecosystem (npm, GitHub Actions), major bumps ignored (do those yourself), max 2 + 1 open PRs, **no auto-merge**.
`wrangler` is a devDependency, so it never ships to Cloudflare and updates can break CI, not the live site.

Recommended: GitHub → Settings → Branches → protect `master` and require the **Test** check to pass before merging.
