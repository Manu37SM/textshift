// functions/api/paraphrase.js — POST /api/paraphrase
import { createAiRoute } from "../_lib/aiRoute.js";
import { buildParaphrase } from "../_lib/prompts/tools.js";

const route = createAiRoute({
  route: "paraphrase",
  temperature: 0.7,
  maxTokens: 2048,
  build: (body, text) => {
    const { system, user } = buildParaphrase(body);
    return { system, user: user(text) };
  },
});

export const onRequestOptions = route.onRequestOptions;
export const onRequestPost = route.onRequestPost;
