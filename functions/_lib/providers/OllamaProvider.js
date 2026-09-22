// functions/_lib/providers/OllamaProvider.js
//
// LOCAL / OPEN SOURCE — not a hosted free tier, an actual local model.
//   - Genuinely $0 forever: runs on your own machine, no account, no rate limit
//     imposed by anyone but your own hardware.
//   - Only reachable at http://localhost:11434 — this means it works when you run
//     `wrangler pages dev` locally, but it CANNOT be reached by your deployed
//     Cloudflare Pages site in production (Cloudflare's edge cannot see your laptop).
//     Use this for local development/testing, or if you later self-host the backend
//     on a machine that also runs Ollama.
//   - Requires installing Ollama (https://ollama.com) and pulling a model, e.g.:
//       ollama pull llama3.1
//   - No data ever leaves your machine.

import { AIProvider, ProviderError } from "./AIProvider.js";

const DEFAULT_MODEL = "llama3.1";
const DEFAULT_BASE_URL = "http://localhost:11434";

export class OllamaProvider extends AIProvider {
  constructor(env) {
    super();
    this.model = env.OLLAMA_MODEL || DEFAULT_MODEL;
    this.baseUrl = env.OLLAMA_BASE_URL || DEFAULT_BASE_URL;
  }

  get name() {
    return "ollama";
  }

  async chatComplete({ system, user, maxTokens = 1024, temperature = 0.7 }) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          options: { temperature, num_predict: maxTokens },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
    } catch (err) {
      throw new ProviderError(
        "Could not reach Ollama at " + this.baseUrl + " (is `ollama serve` running?).",
        { providerName: this.name, cause: err }
      );
    }

    if (!res.ok) {
      throw new ProviderError(`Ollama request failed (HTTP ${res.status}).`, {
        providerName: this.name,
      });
    }

    const data = await res.json();
    const content = data?.message?.content;
    if (typeof content !== "string" || !content.length) {
      throw new ProviderError("Ollama returned an empty response.", { providerName: this.name });
    }
    return content;
  }
}
