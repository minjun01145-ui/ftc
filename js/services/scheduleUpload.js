export const TRIP_SCHEDULE_FILE_ACCEPT = '.pdf,.hwpx,application/pdf,application/haansofthwpx,application/vnd.hancom.hwpx';
export const MAX_SCHEDULE_DOCUMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED_FILE_NAME = /\.(pdf|hwpx)$/i;

export function validateScheduleFile(file) {
  if (!file) return { ok: false, code: 'DOCUMENT_REQUIRED' };

  const name = String(file.name ?? '');
  const type = String(file.type ?? '').toLowerCase();
  const size = Number(file.size);
  const extension = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? '';

  if (!ALLOWED_FILE_NAME.test(name) || extension === 'hwp') {
    return { ok: false, code: 'UNSUPPORTED_DOCUMENT_TYPE' };
  }
  if (!Number.isFinite(size) || size <= 0) return { ok: false, code: 'EMPTY_DOCUMENT' };
  if (size > MAX_SCHEDULE_DOCUMENT_BYTES) return { ok: false, code: 'DOCUMENT_TOO_LARGE' };
  if (extension === 'pdf' && type !== 'application/pdf') {
    return { ok: false, code: 'DOCUMENT_MIME_MISMATCH' };
  }
  if (extension === 'hwpx' && (type === 'application/pdf' || type.startsWith('image/'))) {
    return { ok: false, code: 'DOCUMENT_MIME_MISMATCH' };
  }

  // HWPX MIME types vary by browser and operating system; the server also checks its ZIP signature.
  return { ok: true, file };
}

export function validateScheduleFiles(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length !== 1) {
    return { accepted: [], rejected: files, error: files.length ? 'MULTIPLE_DOCUMENTS' : 'DOCUMENT_REQUIRED' };
  }
  const result = validateScheduleFile(files[0]);
  return {
    accepted: result.ok ? [files[0]] : [],
    rejected: result.ok ? [] : files,
    error: result.ok ? null : result.code
  };
}

export function scheduleUploadErrorMessage(code) {
  switch (code) {
    case 'DOCUMENT_REQUIRED': return '일정이 포함된 PDF 또는 HWPX 파일을 선택해 주세요.';
    case 'MULTIPLE_DOCUMENTS': return '한 번에 문서 파일 한 개만 선택할 수 있습니다.';
    case 'DOCUMENT_TOO_LARGE': return '파일 크기는 10MB 이하여야 합니다.';
    case 'EMPTY_DOCUMENT': return '빈 파일은 업로드할 수 없습니다.';
    case 'DOCUMENT_MIME_MISMATCH': return '파일 형식 정보를 확인해 주세요.';
    default: return 'PDF 또는 HWPX 파일만 업로드할 수 있습니다.';
  }
}
