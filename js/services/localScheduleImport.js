import { DocumentReadError } from '../documents/documentReadError.js';
import { readHwpxDocument } from '../documents/hwpxReader.js';
import { readPdfLayout } from '../documents/pdfLayoutReader.js';
import { parseScheduleFromLayout, parseScheduleFromTables } from '../scheduleImport/scheduleDocumentParser.js';
import { ScheduleDocumentImportError } from './scheduleDocumentImport.js';
import { scheduleUploadErrorMessage, validateScheduleFile } from './scheduleUpload.js';

/**
 * AI 없이 일정 문서를 읽는 가져오기 서비스. 파일은 이 컴퓨터(브라우저) 안에서만 읽는다.
 * AI 서비스(scheduleDocumentImport.js)와 같은 모양(importFile → 일정 항목 목록)이라 서로 바꿔 쓸 수 있다.
 *
 * PDF  : 글자 위치로 세부 일정 표를 복원하고, 없으면 '주요 경로(➡)' 줄을 읽는다.
 * HWPX : 표를 셀 단위로 읽어 같은 규칙을 적용한다.
 */
function extensionOf(file) {
  return String(file?.name ?? '').toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';
}

export function createLocalScheduleImportService({ readPdf = readPdfLayout, readHwpx = readHwpxDocument } = {}) {
  return Object.freeze({
    label: '문서 표 읽기 · 외부 전송 없음',
    validateFile: validateScheduleFile,

    async importFile(file, context = {}) {
      const validation = validateScheduleFile(file);
      if (!validation.ok) {
        throw new ScheduleDocumentImportError(scheduleUploadErrorMessage(validation.code), { code: validation.code });
      }
      const options = { fallbackYear: context.schoolYear };
      try {
        const result = extensionOf(file) === 'pdf'
          ? parseScheduleFromLayout(await readPdf(file), options)
          : parseScheduleFromTables(await readHwpx(file), options);
        if (!result.items.length) {
          throw new ScheduleDocumentImportError(
            '문서에서 세부 일정 표(시간·일정 칸)나 주요 경로(➡)를 찾지 못했습니다. 스캔한 이미지 PDF는 읽을 수 없습니다. 일정 항목 추가로 직접 입력해 주세요.',
            { code: 'SCHEDULE_NOT_FOUND' }
          );
        }
        return result.items;
      } catch (error) {
        if (error instanceof DocumentReadError) {
          throw new ScheduleDocumentImportError(error.message, { code: error.code, cause: error });
        }
        throw error;
      }
    }
  });
}
