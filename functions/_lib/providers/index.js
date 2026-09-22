// functions/_lib/providers/index.js
//
// Factory + failover wrapper. This is the ONLY file that needs to change to add a
// new provider later (e.g. AnthropicProvider once you have a paid key) — nothing
// in functions/api/*.js or the frontend needs to know which provider is active.
//
// Cost-protection rule: this performs at most ONE call to the primary provider,
// and — only if that call fails outright (network/auth/empty-response error) —
// at most ONE call to a configured fallback provider. It never retries the same
// provider, and never calls more than two providers total for one request.

import { GroqProvider } from "./GroqProvider.js";
import { WorkersAIProvider } from "./WorkersAIProvider.js";
import { OllamaProvider } from "./OllamaProvider.js";
import { ProviderError } from "./AIProvider.js";

// Future paid providers plug in here once you have keys, e.g.:
//   import { AnthropicProvider } from "./AnthropicProvider.js";
//   import { OpenAIProvider } from "./OpenAIProvider.js";
//   import { GeminiProvider } from "./GeminiProvider.js";
const REGISTRY = {
  groq: GroqProvider,
  "workers-ai": WorkersAIProvider,
  ollama: OllamaProvider,
  // anthropic: AnthropicProvider,
  // openai: OpenAIProvider,
  // gemini: GeminiProvider,
};

function instantiate(providerId, env) {
  const ProviderClass = REGISTRY[providerId];
  if (!ProviderClass) {
    throw new ProviderError(`Unknown AI provider "${providerId}".`);
  }
  return new ProviderClass(env);
}

/**
 * @param {object} env - the Pages Function env (bindings + vars)
 * @param {object} args - { system, user, maxTokens, temperature, json }
 * @returns {Promise<{ text: string, providerUsed: string }>}
 */
export async function runAI(env, args) {
  const primaryId = env.AI_PROVIDER || "groq";
  const fallbackId = env.FALLBACK_AI_PROVIDER; // optional, e.g. "workers-ai"

  const primary = instantiate(primaryId, env);
  try {
    const text = await primary.chatComplete(args);
    return { text, providerUsed: primary.name };
  } catch (primaryErr) {
    if (!fallbackId || fallbackId === primaryId) {
      throw primaryErr;
    }
    const fallback = instantiate(fallbackId, env);
    const text = await fallback.chatComplete(args); // if this also throws, it propagates — no further attempts
    return { text, providerUsed: fallback.name };
  }
}
