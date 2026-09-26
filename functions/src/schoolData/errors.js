export class SchoolDataError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'SchoolDataError';
    this.status = status;
    this.code = code;
  }
}
