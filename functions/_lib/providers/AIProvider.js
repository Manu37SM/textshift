// functions/_lib/providers/AIProvider.js
//
// Every provider implements this interface. The rest of the app (the API routes,
// the prompt templates) only ever talks to this interface — never to a specific
// vendor's SDK or response shape. That's what lets you add AnthropicProvider,
// OpenAIProvider, or GeminiProvider later without touching anything else.

export class AIProvider {
  /** @returns {string} short id used in logs/responses, e.g. "groq" */
  get name() {
    throw new Error("Provider must implement `name`.");
  }

  /**
   * @param {{system: string, user: string, maxTokens?: number, temperature?: number, json?: boolean}} args
   * @returns {Promise<string>} the model's raw text reply
   */
  async chatComplete(_args) {
    throw new Error("Provider must implement chatComplete().");
  }
}

export class ProviderError extends Error {
  constructor(message, { providerName, cause } = {}) {
    super(message);
    this.name = "ProviderError";
    this.providerName = providerName;
    this.cause = cause;
  }
}
