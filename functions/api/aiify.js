// functions/api/aiify.js — POST /api/aiify  (Human → AI)
import { parseJsonBody, validateText, validateEnum, ValidationError } from "../_lib/validate.js";
import { checkRateLimit } from "../_lib/rateLimit.js";
import { jsonResponse, errorResponse, optionsResponse } from "../_lib/response.js";
import { runAI } from "../_lib/providers/index.js";
import { buildHumanToAiPrompt } from "../_lib/prompts/humanToAi.js";
import { ProviderError } from "../_lib/providers/AIProvider.js";

const STYLES = ["general", "professional", "academic", "technical", "business", "structured"];
const LEVELS = ["light", "medium", "strong"];

export async function onRequestOptions({ env }) {
  return optionsResponse(env);
}

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, request, "aiify");
  if (!rl.allowed) {
    return errorResponse("Rate limit reached. Please try again tomorrow.", { status: 429, env });
  }

  try {
    const body = await parseJsonBody(request, env);
    const text = validateText(body.text, env);
    const style = validateEnum(body.style || "general", STYLES, "style");
    const structureLevel = validateEnum(body.structureLevel || "medium", LEVELS, "structureLevel");
    const preserveLength = Boolean(body.preserveLength);

    const { system, buildUser } = buildHumanToAiPrompt({ style, structureLevel, preserveLength });

    const { text: result, providerUsed } = await runAI(env, {
      system,
      user: buildUser(text),
      maxTokens: 2048,
      temperature: 0.5,
    });

    return jsonResponse(
      { result: result.trim(), providerUsed, originalLength: text.length, resultLength: result.trim().length },
      { env }
    );
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(err.message, { status: 400, env });
    if (err instanceof ProviderError) {
      return errorResponse(
        "The AI provider is temporarily unavailable. Please try again shortly.",
        { status: 502, env }
      );
    }
    return errorResponse("Something went wrong processing your request.", { status: 500, env });
  }
}
