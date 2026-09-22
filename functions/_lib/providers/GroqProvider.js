// functions/_lib/providers/GroqProvider.js
//
// FREE TIER (verify current numbers at https://console.groq.com/docs/rate-limits
// before relying on this — free-tier limits are set by Groq, not by this app):
//   - No credit card required to sign up or to use the free tier.
//   - ~30 requests/minute, ~14,400 requests/day on Llama-family models (varies by model).
//   - Commercial use of the API output is permitted under Groq's terms; the underlying
//     models (e.g. Llama 3.3) carry Meta's own license terms.
//   - Groq's policy at time of writing: prompts/completions are not used to train
//     models, but you should re-check their current privacy policy yourself —
//     this is not legal advice and provider policies change.
//   - This is an ongoing free tier (not a time-limited trial credit), but a provider
//     can change free-tier terms at any time. Treat it as FREE TIER, not FREE FOREVER.

import { AIProvider, ProviderError } from "./AIProvider.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const REQUEST_TIMEOUT_MS = 20000;

export class GroqProvider extends AIProvider {
  constructor(env) {
    super();
    this.apiKey = env.GROQ_API_KEY;
    this.model = env.GROQ_MODEL || DEFAULT_MODEL;
  }

  get name() {
    return "groq";
  }

  async chatComplete({ system, user, maxTokens = 1024, temperature = 0.7, json = false }) {
    if (!this.apiKey) {
      throw new ProviderError("Groq is not configured (missing GROQ_API_KEY).", {
        providerName: this.name,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: maxTokens,
          temperature,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
    } catch (err) {
      throw new ProviderError("Could not reach Groq (network error or timeout).", {
        providerName: this.name,
        cause: err,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      // Deliberately do not forward Groq's raw error body to the client —
      // it can contain account/billing detail. Log server-side only if you add logging.
      throw new ProviderError(`Groq request failed (HTTP ${res.status}).`, {
        providerName: this.name,
      });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.length) {
      throw new ProviderError("Groq returned an empty response.", { providerName: this.name });
    }
    return content;
  }
}
