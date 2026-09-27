export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export class DocumentRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'DocumentRequestError';
    this.status = status;
    this.code = code;
  }
}

export function sanitizeDocumentFilename(value) {
  const original = String(value ?? '').normalize('NFC').replaceAll('\\', '/').split('/').at(-1) ?? '';
  const cleaned = original.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new DocumentRequestError(400, 'INVALID_DOCUMENT_NAME', '파일 이름을 확인해 주세요.');
  }
  const extension = cleaned.match(/\.[^.]+$/)?.[0] ?? '';
  const stem = extension ? cleaned.slice(0, -extension.length) : cleaned;
  return `${stem.slice(0, 150) || 'document'}${extension.slice(0, 20)}`;
}

export function validateDocumentFile(file) {
  const filename = sanitizeDocumentFilename(file?.filename);
  const extension = filename.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? '';
  const mimeType = String(file?.mimeType ?? '').split(';')[0].trim().toLowerCase();
  const buffer = Buffer.isBuffer(file?.buffer) ? file.buffer : Buffer.from(file?.buffer ?? []);

  if (buffer.length === 0) {
    throw new DocumentRequestError(400, 'EMPTY_DOCUMENT', '빈 파일은 업로드할 수 없습니다.');
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new DocumentRequestError(413, 'DOCUMENT_TOO_LARGE', '파일 크기는 10MB 이하여야 합니다.');
  }
  if (extension !== 'pdf' && extension !== 'hwpx') {
    throw new DocumentRequestError(415, 'UNSUPPORTED_DOCUMENT_TYPE', 'PDF 또는 HWPX 파일만 사용할 수 있습니다.');
  }
  if (extension === 'pdf') {
    if (mimeType !== 'application/pdf') {
      throw new DocumentRequestError(415, 'DOCUMENT_MIME_MISMATCH', 'PDF 파일의 형식 정보가 올바르지 않습니다.');
    }
    const header = buffer.subarray(0, 1024).toString('latin1');
    if (!header.includes('%PDF-')) {
      throw new DocumentRequestError(422, 'INVALID_DOCUMENT_FORMAT', 'PDF 파일 내용을 읽을 수 없습니다.');
    }
  } else {
    // HWPX MIME types are inconsistent across browsers; verify both the extension and ZIP signature.
    if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
      throw new DocumentRequestError(415, 'DOCUMENT_MIME_MISMATCH', 'HWPX 파일의 형식 정보가 올바르지 않습니다.');
    }
    const isZip = buffer.length >= 4
      && buffer[0] === 0x50 && buffer[1] === 0x4b
      && ((buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06));
    if (!isZip) {
      throw new DocumentRequestError(422, 'INVALID_DOCUMENT_FORMAT', 'HWPX 압축 문서 형식이 아닙니다.');
    }
  }

  return { filename, mimeType, buffer };
}
