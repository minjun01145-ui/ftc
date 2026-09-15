export class AiError extends Error {
  constructor(message, { code = 'AI_ERROR', status = 0, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

export class AiNotConfiguredError extends AiError {
  constructor() {
    super('AI 연결이 설정되지 않았습니다.', { code: 'AI_NOT_CONFIGURED' });
    this.name = 'AiNotConfiguredError';
  }
}
