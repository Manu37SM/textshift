// functions/api/config.js — GET /api/config
// Public, non-secret runtime config for the static frontend (no build step, so it can't be inlined).
// The Turnstile SITE key is public by design; the SECRET key never leaves the server.
import { jsonResponse, optionsResponse } from "../_lib/response.js";

export async function onRequestOptions({ env }) {
  return optionsResponse(env);
}

export async function onRequestGet({ env }) {
  return jsonResponse(
    {
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
      maxChars: Number(env.MAX_INPUT_CHARS) || 6000,
      dailyLimit: Number(env.MAX_REQUESTS_PER_IP_PER_DAY) || 30,
    },
    { env }
  );
}
