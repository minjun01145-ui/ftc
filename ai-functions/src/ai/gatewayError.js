export class AiGatewayError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AiGatewayError';
    this.status = status;
    this.code = code;
  }
}
