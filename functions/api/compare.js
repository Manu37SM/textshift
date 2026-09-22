// functions/api/compare.js — POST /api/compare  (Compare / Analyze Transformation)
//
// Cost note: this endpoint makes exactly TWO AI requests total — one detector call
// for `original`, one for `transformed` — run in parallel. That is the minimum
// needed to report a genuine "before" and "after" estimate; everything else here
// (word/char/sentence counts, formality proxy, repetition proxy) is computed
// locally with no AI call.
import { parseJsonBody, validateText, ValidationError } from "../_lib/validate.js";
import { checkRateLimit } from "../_lib/rateLimit.js";
import { jsonResponse, errorResponse, optionsResponse } from "../_lib/response.js";
import { detectText, DISCLAIMER } from "./detect.js";

export async function onRequestOptions({ env }) {
  return optionsResponse(env);
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function sentenceCount(text) {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

function avgSentenceLength(text) {
  const w = wordCount(text);
  const s = sentenceCount(text);
  return s ? Number((w / s).toFixed(1)) : 0;
}

function repetitionScore(text) {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (!words.length) return 0;
  const counts = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  const repeated = Object.values(counts).filter((c) => c > 2).length;
  return Number(((repeated / new Set(words).size || 0) * 100).toFixed(1));
}

function localStats(text) {
  return {
    wordCount: wordCount(text),
    charCount: text.length,
    sentenceCount: sentenceCount(text),
    avgSentenceLength: avgSentenceLength(text),
    repetitionScore: repetitionScore(text), // rough % of vocabulary that repeats often — a proxy, not a precise metric
  };
}

export async function onRequestPost({ request, env }) {
  const rl = await checkRateLimit(env, request, "compare");
  if (!rl.allowed) {
    return errorResponse("Rate limit reached. Please try again tomorrow.", { status: 429, env });
  }

  try {
    const body = await parseJsonBody(request, env);
    const original = validateText(body.original, env, { fieldName: "original" });
    const transformed = validateText(body.transformed, env, { fieldName: "transformed" });

    const [beforeDetection, afterDetection] = await Promise.all([
      detectText(env, original),
      detectText(env, transformed),
    ]);

    const before = localStats(original);
    const after = localStats(transformed);

    const structuralObservations = [];
    const wordDelta = after.wordCount - before.wordCount;
    if (Math.abs(wordDelta) > 0) {
      structuralObservations.push(
        `Word count changed from ${before.wordCount} to ${after.wordCount} (${wordDelta > 0 ? "+" : ""}${wordDelta}).`
      );
    }
    if (before.avgSentenceLength !== after.avgSentenceLength) {
      structuralObservations.push(
        `Average sentence length changed from ${before.avgSentenceLength} to ${after.avgSentenceLength} words.`
      );
    }
    if (before.repetitionScore !== after.repetitionScore) {
      structuralObservations.push(
        `Estimated repetition changed from ${before.repetitionScore}% to ${after.repetitionScore}%.`
      );
    }
    structuralObservations.push(
      `Estimated linguistic characteristics changed from "${beforeDetection.classification}" to "${afterDetection.classification}".`
    );

    return jsonResponse(
      {
        original: before,
        transformed: after,
        aiLikeness: { before: beforeDetection.ai_likeness, after: afterDetection.ai_likeness },
        humanLikeness: { before: beforeDetection.human_likeness, after: afterDetection.human_likeness },
        confidence: { before: beforeDetection.confidence, after: afterDetection.confidence },
        classification: { before: beforeDetection.classification, after: afterDetection.classification },
        observations: structuralObservations,
        disclaimer:
          DISCLAIMER +
          " These are estimated linguistic characteristics only, not proof that the text became human-written or AI-written.",
      },
      { env }
    );
  } catch (err) {
    if (err instanceof ValidationError) return errorResponse(err.message, { status: 400, env });
    return errorResponse("Something went wrong processing your request.", { status: 500, env });
  }
}
