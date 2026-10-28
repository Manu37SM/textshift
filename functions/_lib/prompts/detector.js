// functions/_lib/prompts/detector.js

export const DETECTOR_SYSTEM_PROMPT = `You are a linguistic-analysis assistant. You analyze text for stylistic characteristics that are statistically more common in AI-generated writing versus human writing.

You must NOT claim to definitively determine whether text was written by AI or a human. Use probabilistic, hedged language. AI detection is inherently uncertain and can produce false positives and false negatives.

The text may be in any language. Judge it in its own language, not by English conventions. Be especially cautious with non-English text and with writing by non-native speakers: simple vocabulary, literal or translation-like phrasing and regular grammar are common in human writing and are NOT evidence of AI. Lower your confidence (use "low" or "medium") for non-English text, and say so in the explanation.\n\nBase every observation on the specific text provided. Do not fabricate evidence, and do not rely on a single simplistic signal (such as the presence of one word). Consider multiple characteristics together:
- sentence structure variation
- vocabulary diversity
- repetition
- predictability of phrasing
- transition usage
- formality
- generic vs. specific phrasing
- personal voice
- conversational characteristics
- structural regularity and paragraph organization

Respond with ONLY a single JSON object, no other text, matching exactly this shape:
{
  "classification": "more_human_like" | "more_ai_like" | "mixed_uncertain",
  "ai_likeness": <integer 0-100>,
  "human_likeness": <integer 0-100>,
  "confidence": "low" | "medium" | "high",
  "observations": [<3 to 6 short strings, each a specific, text-grounded observation>],
  "explanation": "<2-4 sentence plain-language summary, using hedged/probabilistic language>"
}`;

export function buildDetectorUserPrompt(text) {
  return `Analyze the following text:\n\n"""\n${text}\n"""\n\nRespond with only the JSON object described in your instructions.`;
}

/**
 * Extract the detector's JSON from a model reply that may include stray text
 * around it. Returns null (never throws) if nothing usable is found.
 */
export function extractDetectorJson(raw) {
  if (typeof raw !== "string") return null;
  try {
    return normalizeResult(JSON.parse(raw));
  } catch {
    // fall through to brace-matching
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return normalizeResult(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
}

function clampScore(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeResult(obj) {
  const validClass = ["more_human_like", "more_ai_like", "mixed_uncertain"];
  const validConfidence = ["low", "medium", "high"];

  const classification = validClass.includes(obj.classification)
    ? obj.classification
    : "mixed_uncertain";
  const confidence = validConfidence.includes(obj.confidence) ? obj.confidence : "low";
  const ai_likeness = clampScore(obj.ai_likeness) ?? 50;
  const human_likeness = clampScore(obj.human_likeness) ?? 50;
  const observations = Array.isArray(obj.observations)
    ? obj.observations.filter((o) => typeof o === "string").slice(0, 6)
    : [];
  const explanation =
    typeof obj.explanation === "string" && obj.explanation.length
      ? obj.explanation
      : "The model did not return a usable explanation for this result.";

  return { classification, ai_likeness, human_likeness, confidence, observations, explanation };
}

/**
 * Local, non-AI heuristic used ONLY as a last-resort fallback if the AI provider
 * is unavailable or returns unparseable output. This is intentionally crude —
 * it exists so the endpoint degrades gracefully instead of failing outright,
 * not as a substitute for the AI-based analysis. Always returns "low" confidence.
 */
export function heuristicFallback(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^\w']/g, "")));
  const lexicalDiversity = words.length ? uniqueWords.size / words.length : 0;
  const avgSentenceLen = sentences.length ? words.length / sentences.length : 0;
  const sentenceLens = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const variance =
    sentenceLens.length > 1
      ? sentenceLens.reduce((sum, l) => sum + Math.pow(l - avgSentenceLen, 2), 0) / sentenceLens.length
      : 0;
  const stdDev = Math.sqrt(variance);

  // Very low sentence-length variance + very high lexical diversity loosely
  // correlate with more uniform, "smoothed" writing. This is a coarse proxy,
  // not a real classifier — hence "low" confidence and an explicit disclaimer.
  const uniformityScore = stdDev < 3 ? 65 : stdDev < 6 ? 50 : 35;
  const ai_likeness = Math.round((uniformityScore + (1 - lexicalDiversity) * 100) / 2);
  const human_likeness = 100 - ai_likeness;

  return {
    classification:
      Math.abs(ai_likeness - human_likeness) < 15
        ? "mixed_uncertain"
        : ai_likeness > human_likeness
        ? "more_ai_like"
        : "more_human_like",
    ai_likeness,
    human_likeness,
    confidence: "low",
    observations: [
      `Average sentence length: ${avgSentenceLen.toFixed(1)} words`,
      `Sentence-length variation (std. dev.): ${stdDev.toFixed(1)}`,
      `Lexical diversity (unique/total words): ${(lexicalDiversity * 100).toFixed(0)}%`,
      "This result used a basic local fallback, not the AI analysis, because the AI provider was unavailable.",
    ],
    explanation:
      "The AI-based detector could not be reached, so this is a rough, low-confidence estimate from basic sentence and word statistics only. Treat it as significantly less reliable than a normal result.",
  };
}
