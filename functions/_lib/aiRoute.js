// functions/_lib/aiRoute.js
// Factory for single-call "text in → text out" AI endpoints (paraphrase, summarize,
// grammar, translate). Same guarantees as humanize/aiify: rate limit first, validate
// input, exactly one AI call (plus the single configured fallback), safe error messages.
import { parseJsonBody, validateText, ValidationError } from "./validate.js";
import { checkRateLimit } from "./rateLimit.js";
import { jsonResponse, errorResponse, optionsResponse, denyResponse, rateHeaders } from "./response.js";
import { runAI } from "./providers/index.js";
import { ProviderError } from "./providers/AIProvider.js";

/**
 * @param {{route: string, temperature: number, maxTokens: number,
 *          build: (body: object, text: string) => {system: string, user: string}}} cfg
 *   `build` may throw ValidationError for bad options.
 */
export function createAiRoute({ route, temperature, maxTokens, build }) {
  async function onRequestOptions({ env }) {
    return optionsResponse(env);
  }

  async function onRequestPost({ request, env }) {
    const rl = await checkRateLimit(env, request, route);
    if (!rl.allowed) {
      return denyResponse(rl, env);
    }
    try {
      const body = await parseJsonBody(request, env);
      const text = validateText(body.text, env);
      const { system, user } = build(body, text);
      const { text: raw, providerUsed } = await runAI(env, { system, user, maxTokens, temperature });
      const result = raw.trim();
      return jsonResponse(
        { result, providerUsed, originalLength: text.length, resultLength: result.length },
        { env, headers: rateHeaders(rl) }
      );
    } catch (err) {
      if (err instanceof ValidationError) return errorResponse(err.message, { status: 400, env });
      if (err instanceof ProviderError) {
        return errorResponse("The AI provider is temporarily unavailable. Please try again shortly.", {
          status: 502,
          env,
        });
      }
      return errorResponse("Something went wrong processing your request.", { status: 500, env });
    }
  }

  return { onRequestOptions, onRequestPost };
}
