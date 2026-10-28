// functions/_lib/response.js
// Shared response helpers. Never leak stack traces or internal error detail to the client.

export function corsHeaders(env) {
  const origin = (env && env.ALLOWED_ORIGIN) || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Turnstile-Token",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "X-RateLimit-Remaining, X-RateLimit-Limit",
  };
}

export function jsonResponse(data, { status = 200, env = {}, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...corsHeaders(env),
      ...headers,
    },
  });
}

export function errorResponse(message, { status = 400, env = {}, headers = {} } = {}) {
  // `message` must always be a safe, pre-written string — never pass raw
  // caught-error objects or provider response bodies into this function.
  return jsonResponse({ error: message }, { status, env, headers });
}

export function optionsResponse(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

/** Quota headers so the UI can show "requests left today". */
export function rateHeaders(rl) {
  if (!rl || typeof rl.limit !== "number") return {};
  return { "X-RateLimit-Remaining": String(Math.max(0, rl.remaining)), "X-RateLimit-Limit": String(rl.limit) };
}

/** Response for a request that checkRateLimit() refused (bot check failed or daily cap reached). */
export function denyResponse(rl, env) {
  if (rl && rl.reason === "verify") {
    return errorResponse("Verification failed. Please reload the page and try again.", { status: 403, env });
  }
  if (rl && rl.reason === "verify-unavailable") {
    return errorResponse("The verification service is unavailable. Please try again shortly.", { status: 503, env });
  }
  return errorResponse("Rate limit reached. Please try again tomorrow.", { status: 429, env, headers: rateHeaders(rl) });
}
