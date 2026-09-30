export class ScheduleDocumentImportError extends Error {
  constructor(message, { code = 'SCHEDULE_DOCUMENT_IMPORT_FAILED', cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ScheduleDocumentImportError';
    this.code = code;
  }
}
