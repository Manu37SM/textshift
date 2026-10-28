// functions/api/translate.js — POST /api/translate
import { createAiRoute } from "../_lib/aiRoute.js";
import { buildTranslate } from "../_lib/prompts/tools.js";

const route = createAiRoute({
  route: "translate",
  temperature: 0.2,
  maxTokens: 3000,
  build: (body, text) => {
    const { system, user } = buildTranslate(body);
    return { system, user: user(text) };
  },
});

export const onRequestOptions = route.onRequestOptions;
export const onRequestPost = route.onRequestPost;
