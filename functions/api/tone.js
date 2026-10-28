// functions/api/tone.js — POST /api/tone  (tone check + suggested rewrite, one AI call)
import { parseJsonBody, validateText, ValidationError } from "../_lib/validate.js";
import { checkRateLimit } from "../_lib/rateLimit.js";
import { jsonResponse, errorResponse, optionsResponse, denyResponse, rateHeaders } from "../_lib/response.js";
import { runAI } from "../_lib/providers/index.js";
import { ProviderError } from "../_lib/providers/AIProvider.js";
import { buildTonePrompt, parseToneJson } from "../_lib/prompts/tone.js";

export async function onRequestOptions({ env }) {
  return optionsResponse(env);
}

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, request, "tone");
  if (!rl.allowed) {
    return denyResponse(rl, env);
  }
  try {
    const body = await parseJsonBody(request, env);
    const text = validateText(body.text, env);
    const { system, user } = buildTonePrompt(body);
    const { text: raw, providerUsed } = await runAI(env, {
      system,
      user: user(text),
      maxTokens: 1500,
      temperature: 0.4,
      json: true,
    });
    const parsed = parseToneJson(raw);
    if (!parsed) {
      return errorResponse("The AI returned an unreadable analysis. Please try again.", { status: 502, env });
    }
    return jsonResponse({ ...parsed, providerUsed }, { env, headers: rateHeaders(rl) });
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(err.message, { status: 400, env });
    if (err instanceof ProviderError) {
      return errorResponse("The AI provider is temporarily unavailable. Please try again shortly.", { status: 502, env });
    }
    return errorResponse("Something went wrong processing your request.", { status: 500, env });
  }
}
