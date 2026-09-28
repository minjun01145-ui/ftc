/**
 * AI provider가 HTTP 오류를 반환했을 때 사용합니다.
 * message에는 provider 응답만 담고 API 키는 넣지 않습니다.
 */
export class AiProviderError extends Error {
  constructor(message, { status = 0, model = '' } = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
    this.model = model;
  }
}
