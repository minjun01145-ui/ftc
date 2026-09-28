export class DocumentReadError extends Error {
  constructor(message, { code = 'DOCUMENT_READ_FAILED', cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'DocumentReadError';
    this.code = code;
  }
}
