import { scheduleUploadErrorMessage, validateScheduleFile } from './scheduleUpload.js';
import { ScheduleDocumentImportError } from '../documents/scheduleDocumentImportError.js';
export { ScheduleDocumentImportError } from '../documents/scheduleDocumentImportError.js';

export const TRIP_SCHEDULE_DOCUMENT_CAPABILITY = 'trip-schedule-from-document';

export function createScheduleDocumentImportService({ aiClient } = {}) {
  return Object.freeze({
    label: 'AI 분석',
    validateFile: validateScheduleFile,

    async importFile(file, context = {}) {
      const validation = validateScheduleFile(file);
      if (!validation.ok) {
        throw new ScheduleDocumentImportError(scheduleUploadErrorMessage(validation.code), {
          code: validation.code
        });
      }
      if (!aiClient || typeof aiClient.invokeDocument !== 'function') {
        throw new ScheduleDocumentImportError('AI 일정 문서 가져오기를 사용할 수 없습니다.', {
          code: 'AI_NOT_CONFIGURED'
        });
      }

      const response = await aiClient.invokeDocument(TRIP_SCHEDULE_DOCUMENT_CAPABILITY, file, {
        projectTitle: String(context.projectTitle ?? '').trim(),
        schoolYear: String(context.schoolYear ?? '').trim(),
        startDate: String(context.startDate ?? '').trim(),
        endDate: String(context.endDate ?? '').trim()
      });

      const items = response?.result?.items;
      if (!Array.isArray(items)) {
        throw new ScheduleDocumentImportError('일정 문서 분석 결과를 읽을 수 없습니다.', {
          code: 'AI_INVALID_RESPONSE'
        });
      }
      return items;
    }
  });
}
