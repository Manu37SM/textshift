// functions/_lib/providers/WorkersAIProvider.js
//
// FREE TIER (verify at https://developers.cloudflare.com/workers-ai/platform/pricing/):
//   - No credit card required on the Workers Free plan.
//   - 10,000 "Neurons" (Cloudflare's normalized compute unit) per day, shared across
//     every model, resetting daily at 00:00 UTC. For a 70B chat model this is roughly
//     enough for a modest number of requests per day — treat it as a backup/failover
//     provider for this app, not the primary one, if you expect real daily traffic.
//   - Runs entirely on Cloudflare's own infrastructure, which is convenient because
//     this app is already deployed on Cloudflare Pages — no second account needed.
//   - This binding only works when the Worker/Pages Function actually has an `AI`
//     binding configured (see wrangler.toml). It does NOT work by just having an
//     API key; it's a native binding, not a plain HTTPS call.
//   - Ongoing free tier, not a trial credit — but Cloudflare can change it at any time.

import { AIProvider, ProviderError } from "./AIProvider.js";

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export class WorkersAIProvider extends AIProvider {
  constructor(env) {
    super();
    this.binding = env.AI; // the Workers AI binding, set in wrangler.toml
    this.model = env.WORKERS_AI_MODEL || DEFAULT_MODEL;
  }

  get name() {
    return "workers-ai";
  }

  async chatComplete({ system, user, maxTokens = 1024, temperature = 0.7 }) {
    if (!this.binding) {
      throw new ProviderError(
        "Workers AI is not configured (no `AI` binding — add it in wrangler.toml).",
        { providerName: this.name }
      );
    }

    let result;
    try {
      result = await this.binding.run(this.model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature,
      });
    } catch (err) {
      throw new ProviderError("Workers AI request failed.", {
        providerName: this.name,
        cause: err,
      });
    }

    // Workers AI chat models typically return { response: "..." }
    const content = result?.response ?? (typeof result === "string" ? result : null);
    if (typeof content !== "string" || !content.length) {
      throw new ProviderError("Workers AI returned an empty response.", {
        providerName: this.name,
      });
    }
    return content;
  }
}
