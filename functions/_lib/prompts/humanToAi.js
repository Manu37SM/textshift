import { voiceBlock } from "../voice.js";

// functions/_lib/prompts/humanToAi.js

const LANGUAGE_RULE = `Language: the text may be in any language. Write the result in the same language and script as the input (for example Hindi stays in Devanagari, Hinglish stays Hinglish). Never translate it into English. Tokens such as [[EMAIL_1]] or [[PHONE_2]] are privacy placeholders: copy them exactly as written, never translate, reformat or remove them.`;

const BASE_SYSTEM_PROMPT = `You are a structured writing assistant.

Transform the supplied text into clear, organized, precise writing while preserving the original meaning, facts, intent, and important details.

Do not invent facts.

Improve organization, clarity, consistency, and logical structure where appropriate.

Do not unnecessarily change the author's intended meaning.

Preserve names, numbers, dates, citations, URLs, code, formulas, and technical terminology.

Return ONLY the rewritten text. Do not add commentary, headings, quotation marks around the result, or notes about what you changed.`;

const STYLE_NOTES = {
  general: "Use a clear, general-purpose polished style suitable for most contexts.",
  professional: "Use a professional style suitable for workplace communication.",
  academic: "Use an academic style — formal register, precise claims, logical connectors used purposefully (not decoratively).",
  technical: "Use a technical style aimed at a knowledgeable reader — precise terminology, unambiguous phrasing.",
  business: "Use a business style — concise, outcome-oriented, confident.",
  structured: "Use a clearly structured style, favoring short paragraphs and, where genuinely helpful, lists or headings.",
};

const STRUCTURE_LEVEL_NOTES = {
  light: "Apply light restructuring: keep the original paragraph/sentence structure mostly intact, tighten wording only.",
  medium: "Apply medium restructuring: reorganize sentences and paragraphs where it clearly improves clarity and logical flow.",
  strong: "Apply strong restructuring: reorganize freely (including reordering points and adding structure like lists or headings if helpful) to maximize clarity, while preserving every fact and the original argument.",
};

export function buildHumanToAiPrompt({
  style = "general",
  structureLevel = "medium",
  preserveLength = false,
  voice = "",
} = {}) {
  const notes = [
    STYLE_NOTES[style] || STYLE_NOTES.general,
    STRUCTURE_LEVEL_NOTES[structureLevel] || STRUCTURE_LEVEL_NOTES.medium,
    preserveLength
      ? "Keep the rewritten text approximately the same length (word count) as the original."
      : "Prioritize clarity and structure over matching the original length exactly.",
  ];

  const system = `${BASE_SYSTEM_PROMPT}\n\n${LANGUAGE_RULE}\n\nStyle and options for this request:\n- ${notes.join("\n- ")}${voiceBlock(voice)}`;
  const buildUser = (text) => `Transform the following text:\n\n"""\n${text}\n"""`;

  return { system, buildUser };
}
