// functions/api/detect.js — POST /api/detect  (Text Detector)
import { parseJsonBody, validateText, ValidationError } from "../_lib/validate.js";
import { checkRateLimit } from "../_lib/rateLimit.js";
import { jsonResponse, errorResponse, optionsResponse, denyResponse, rateHeaders } from "../_lib/response.js";
import { runAI } from "../_lib/providers/index.js";
import {
  DETECTOR_SYSTEM_PROMPT,
  buildDetectorUserPrompt,
  extractDetectorJson,
  heuristicFallback,
} from "../_lib/prompts/detector.js";

export const DISCLAIMER =
  "AI-text detection is probabilistic and can produce false positives and false negatives. This result should not be treated as proof of authorship.";

export async function onRequestOptions({ env }) {
  return optionsResponse(env);
}

/** Exported so /api/compare.js can reuse exactly this logic for both texts. */
export async function detectText(env, text) {
  try {
    const { text: raw } = await runAI(env, {
      system: DETECTOR_SYSTEM_PROMPT,
      user: buildDetectorUserPrompt(text),
      maxTokens: 600,
      temperature: 0.2,
      json: true,
    });
    const parsed = extractDetectorJson(raw);
    if (parsed) return { ...parsed, disclaimer: DISCLAIMER, source: "ai" };
    return { ...heuristicFallback(text), disclaimer: DISCLAIMER, source: "heuristic_fallback" };
  } catch {
    return { ...heuristicFallback(text), disclaimer: DISCLAIMER, source: "heuristic_fallback" };
  }
}

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, request, "detect");
  if (!rl.allowed) {
    return denyResponse(rl, env);
  }

  try {
    const body = await parseJsonBody(request, env);
    const text = validateText(body.text, env);
    const result = await detectText(env, text);
    return jsonResponse(result, { env, headers: rateHeaders(rl) });
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(err.message, { status: 400, env });
    return errorResponse("Something went wrong processing your request.", { status: 500, env });
  }
}
