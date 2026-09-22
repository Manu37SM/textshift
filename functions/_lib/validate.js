// functions/_lib/validate.js
// Input validation and cost-protection limits. Everything here fails closed:
// on any doubt, reject the request rather than pass unbounded input to a provider.

const DEFAULT_MAX_CHARS = 6000; // ~1,200-1,500 words; keeps a single request cheap on every free tier
const MIN_CHARS = 1;

export class ValidationError extends Error {}

export function validateText(text, env, { fieldName = "text" } = {}) {
  if (typeof text !== "string") {
    throw new ValidationError(`"${fieldName}" must be a string.`);
  }
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHARS) {
    throw new ValidationError(`"${fieldName}" must not be empty.`);
  }
  const maxChars = Number(env && env.MAX_INPUT_CHARS) || DEFAULT_MAX_CHARS;
  if (trimmed.length > maxChars) {
    throw new ValidationError(
      `"${fieldName}" is too long (${trimmed.length} characters). The limit is ${maxChars} characters per request.`
    );
  }
  return trimmed;
}

export function validateEnum(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `"${fieldName}" must be one of: ${allowed.join(", ")}.`
    );
  }
  return value;
}

export async function parseJsonBody(request, env) {
  const maxBytes = Number(env && env.MAX_REQUEST_BYTES) || 64 * 1024; // 64KB hard cap on request size
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new ValidationError("Request body is too large.");
  }
  let raw;
  try {
    raw = await request.text();
  } catch {
    throw new ValidationError("Could not read request body.");
  }
  if (raw.length > maxBytes) {
    throw new ValidationError("Request body is too large.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}
