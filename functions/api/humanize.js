// functions/api/humanize.js — POST /api/humanize  (AI → Human)
import { parseJsonBody, validateText, validateEnum, ValidationError } from "../_lib/validate.js";
import { checkRateLimit } from "../_lib/rateLimit.js";
import { jsonResponse, errorResponse, optionsResponse, denyResponse, rateHeaders } from "../_lib/response.js";
import { runAI } from "../_lib/providers/index.js";
import { readVoice } from "../_lib/voice.js";
import { buildAiToHumanPrompt } from "../_lib/prompts/aiToHuman.js";
import { ProviderError } from "../_lib/providers/AIProvider.js";

const STYLES = ["natural", "casual", "professional", "academic", "technical", "friendly"];
const LEVELS = ["light", "medium", "strong"];

export async function onRequestOptions({ env }) {
  return optionsResponse(env);
}

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, request, "humanize");
  if (!rl.allowed) {
    return denyResponse(rl, env);
  }

  let body;
  try {
    body = await parseJsonBody(request, env);
    const text = validateText(body.text, env);
    const style = validateEnum(body.style || "natural", STYLES, "style");
    const level = validateEnum(body.level || "medium", LEVELS, "level");
    const preserveLength = Boolean(body.preserveLength);
    const preserveTerminology = body.preserveTerminology !== false; // default true

    const { system, buildUser } = buildAiToHumanPrompt({ style, level, preserveLength, preserveTerminology, voice: readVoice(body) });

    const { text: result, providerUsed } = await runAI(env, {
      system,
      user: buildUser(text),
      maxTokens: 2048,
      temperature: 0.8,
    });

    return jsonResponse(
      { result: result.trim(), providerUsed, originalLength: text.length, resultLength: result.trim().length },
      { env, headers: rateHeaders(rl) }
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
