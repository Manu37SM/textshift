// functions/api/grammar.js — POST /api/grammar
import { createAiRoute } from "../_lib/aiRoute.js";
import { buildGrammar } from "../_lib/prompts/tools.js";

const route = createAiRoute({
  route: "grammar",
  temperature: 0.1,
  maxTokens: 2048,
  build: (body, text) => {
    const { system, user } = buildGrammar(body);
    return { system, user: user(text) };
  },
});

export const onRequestOptions = route.onRequestOptions;
export const onRequestPost = route.onRequestPost;
