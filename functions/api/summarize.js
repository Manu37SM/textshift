// functions/api/summarize.js — POST /api/summarize
import { createAiRoute } from "../_lib/aiRoute.js";
import { buildSummarize } from "../_lib/prompts/tools.js";

const route = createAiRoute({
  route: "summarize",
  temperature: 0.3,
  maxTokens: 1500,
  build: (body, text) => {
    const { system, user } = buildSummarize(body);
    return { system, user: user(text) };
  },
});

export const onRequestOptions = route.onRequestOptions;
export const onRequestPost = route.onRequestPost;
