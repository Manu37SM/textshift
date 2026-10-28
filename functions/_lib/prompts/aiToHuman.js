import { voiceBlock } from "../voice.js";

// functions/_lib/prompts/aiToHuman.js

const LANGUAGE_RULE = `Language: the text may be in any language. Write the result in the same language and script as the input (for example Hindi stays in Devanagari, Hinglish stays Hinglish). Never translate it into English. Tokens such as [[EMAIL_1]] or [[PHONE_2]] are privacy placeholders: copy them exactly as written, never translate, reformat or remove them.`;

const BASE_SYSTEM_PROMPT = `You are a natural-language rewriting assistant.

Rewrite the supplied text so that it reads naturally and clearly while preserving the author's original meaning, factual claims, intent, and important details.

Do not invent information.

Do not intentionally introduce grammatical errors, spelling mistakes, fake personal experiences, or artificial slang.

Avoid repetitive sentence structures and unnecessary transitions.

Avoid overly formulaic language.

Use natural sentence variation and appropriate contractions when they fit the selected style.

Preserve technical terminology, names, numbers, dates, citations, URLs, code, formulas, and factual information.

Do not change the underlying argument or meaning.

The goal is natural, readable writing rather than artificial imperfections.

Return ONLY the rewritten text. Do not add commentary, headings, quotation marks around the result, or notes about what you changed.`;

const STYLE_NOTES = {
  natural: "Write in a plain, natural register — how a thoughtful person would actually write, without forcing extra casualness.",
  casual: "Write in a casual, conversational register — relaxed phrasing, contractions, informal but still clear.",
  professional: "Write in a professional but human register — clear and polished, without sounding like corporate boilerplate.",
  academic: "Write in an academic register — precise, measured, but avoid stiff AI-style hedging and repetitive transitions.",
  technical: "Write in a technical register aimed at a knowledgeable reader — precise terminology, minimal fluff.",
  friendly: "Write in a warm, friendly register — approachable, but do not add jokes or content that wasn't implied by the source.",
};

const LEVEL_NOTES = {
  light: "Apply light humanization: mostly preserve sentence structure, make small wording and rhythm adjustments only.",
  medium: "Apply medium humanization: rework sentence structure and word choice noticeably, while keeping the same points in the same order.",
  strong: "Apply strong humanization: substantially restructure sentences and phrasing for maximum naturalness, while keeping every fact, claim, and detail intact.",
};

export function buildAiToHumanPrompt({
  style = "natural",
  level = "medium",
  preserveLength = false,
  preserveTerminology = true,
  voice = "",
} = {}) {
  const notes = [
    STYLE_NOTES[style] || STYLE_NOTES.natural,
    LEVEL_NOTES[level] || LEVEL_NOTES.medium,
    preserveLength
      ? "Keep the rewritten text approximately the same length (word count) as the original."
      : "Length may vary naturally if that serves clarity, but do not pad or drastically shorten the content.",
    preserveTerminology
      ? "Preserve all technical terminology exactly as given — do not simplify or swap out domain-specific terms."
      : "You may lightly simplify non-essential jargon if it improves readability, but never at the cost of accuracy.",
  ];

  const system = `${BASE_SYSTEM_PROMPT}\n\n${LANGUAGE_RULE}\n\nStyle and options for this request:\n- ${notes.join("\n- ")}${voiceBlock(voice)}`;
  const buildUser = (text) => `Rewrite the following text:\n\n"""\n${text}\n"""`;

  return { system, buildUser };
}
