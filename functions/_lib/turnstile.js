// functions/_lib/turnstile.js — Cloudflare Turnstile (free CAPTCHA) server-side verification.
//
// Opt-in: if TURNSTILE_SECRET_KEY is not set, verification is skipped (local dev, first deploy).
// When it IS set, every AI request must carry a valid single-use token in `X-Turnstile-Token`.
// Fails CLOSED if Cloudflare's verification service can't be reached (unlike the rate-limit
// "no KV bound" case, this is a production-only setting, so blocking is the safe default).
import { getClientIp } from "./rateLimit.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** @returns {Promise<{ok: boolean, skipped?: boolean, unavailable?: boolean}>} */
export async function verifyTurnstile(env, request) {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true, skipped: true };

  const token = request.headers.get("X-Turnstile-Token");
  if (!token || token.length > 2048) return { ok: false };

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  const ip = getClientIp(request);
  if (ip && ip !== "unknown") form.append("remoteip", ip);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form, signal: controller.signal });
    if (!res.ok) return { ok: false, unavailable: true };
    const data = await res.json();
    return { ok: data && data.success === true };
  } catch {
    return { ok: false, unavailable: true };
  } finally {
    clearTimeout(timeout);
  }
}
