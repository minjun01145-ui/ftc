/**
 * @typedef {Object} AiProvider
 * @property {string} id
 * @property {(request: ProviderRequest) => Promise<ProviderResponse>} generate
 *
 * @typedef {Object} ProviderRequest
 * @property {string} model
 * @property {Array<{role: 'system'|'user'|'assistant', content: string}>} messages
 * @property {Object=} options
 *
 * @typedef {Object} ProviderResponse
 * @property {string} text
 * @property {string} provider
 * @property {string=} model
 * @property {Object=} usage
 */

/**
 * 런타임에서 최소한의 provider 계약만 확인합니다.
 */
export function assertAiProvider(provider) {
  if (!provider || typeof provider.id !== 'string' || typeof provider.generate !== 'function') {
    throw new TypeError('올바른 AI provider가 아닙니다.');
  }
  return provider;
}
