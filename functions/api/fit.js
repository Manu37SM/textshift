// functions/api/fit.js — POST /api/fit  (rewrite to a target: reading grade, max characters, max words)
import { createAiRoute } from "../_lib/aiRoute.js";
import { buildFit } from "../_lib/prompts/tools.js";

const route = createAiRoute({
  route: "fit",
  temperature: 0.3,
  maxTokens: 2048,
  build: (body, text) => {
    const { system, user } = buildFit(body);
    return { system, user: user(text) };
  },
});

export const onRequestOptions = route.onRequestOptions;
export const onRequestPost = route.onRequestPost;
