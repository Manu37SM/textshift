// functions/_lib/response.js
// Shared response helpers. Never leak stack traces or internal error detail to the client.

export function corsHeaders(env) {
  const origin = (env && env.ALLOWED_ORIGIN) || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResponse(data, { status = 200, env = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      ...corsHeaders(env),
    },
  });
}

export function errorResponse(message, { status = 400, env = {} } = {}) {
  // `message` must always be a safe, pre-written string — never pass raw
  // caught-error objects or provider response bodies into this function.
  return jsonResponse({ error: message }, { status, env });
}

export function optionsResponse(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}
