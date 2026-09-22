// functions/_lib/rateLimit.js
// Simple fixed-window per-IP rate limiter backed by Cloudflare KV (free tier: ~100k
// reads/day, ~1k writes/day per account — plenty for a low-traffic personal deployment).
//
// Fails OPEN if the KV binding is missing (e.g. first local run before you've created
// the namespace) so local development still works, but fails CLOSED (blocks the request)
// if KV is bound but read/write itself errors, since that's the safer default in production.

function todayKey(ip, route) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
  return `rl:${route}:${ip}:${day}`;
}

export function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function checkRateLimit(env, request, route) {
  const limit = Number(env.MAX_REQUESTS_PER_IP_PER_DAY) || 30;
  const kv = env.RATE_LIMIT_KV;

  if (!kv) {
    // No KV bound (local dev without `wrangler pages dev --kv RATE_LIMIT_KV`).
    // Allow the request through rather than blocking local testing.
    return { allowed: true, remaining: limit, limited: false };
  }

  const ip = getClientIp(request);
  const key = todayKey(ip, route);

  try {
    const current = Number((await kv.get(key)) || "0");
    if (current >= limit) {
      return { allowed: false, remaining: 0, limited: true };
    }
    // Best-effort increment; a small race under concurrent requests just means
    // the limit is approximate, which is fine for a cost-protection guard.
    await kv.put(key, String(current + 1), { expirationTtl: 60 * 60 * 26 });
    return { allowed: true, remaining: limit - current - 1, limited: true };
  } catch {
    // KV is bound but errored — fail closed rather than risk unbounded AI spend.
    return { allowed: false, remaining: 0, limited: true, errored: true };
  }
}
