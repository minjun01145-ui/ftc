import Busboy from 'busboy';
import { Readable } from 'node:stream';
import { DocumentRequestError, MAX_DOCUMENT_BYTES } from './documentPolicy.js';

const MAX_MULTIPART_BYTES = MAX_DOCUMENT_BYTES + 64 * 1024;
const MAX_FIELD_BYTES = 16 * 1024;

export async function parseDocumentMultipartRequest(req) {
  if (req.method !== 'POST') {
    throw new DocumentRequestError(405, 'METHOD_NOT_ALLOWED', 'POST 요청만 허용됩니다.');
  }

  const contentLength = Number(req.headers?.['content-length'] ?? req.get?.('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    throw new DocumentRequestError(413, 'PAYLOAD_TOO_LARGE', '요청 크기가 너무 큽니다.');
  }
  if (!/^multipart\/form-data\s*(?:;|$)/i.test(String(req.headers?.['content-type'] ?? req.get?.('content-type') ?? ''))) {
    throw new DocumentRequestError(400, 'INVALID_MULTIPART', 'multipart/form-data 요청이 필요합니다.');
  }

  const body = req.rawBody;
  if (!(Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === 'string')) {
    throw new DocumentRequestError(400, 'INVALID_MULTIPART', '업로드 요청 본문을 읽을 수 없습니다.');
  }
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (buffer.length > MAX_MULTIPART_BYTES) {
    throw new DocumentRequestError(413, 'PAYLOAD_TOO_LARGE', '요청 크기가 너무 큽니다.');
  }

  let parser;
  try {
    parser = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_DOCUMENT_BYTES,
        files: 2,
        fields: 2,
        parts: 4,
        fieldNameSize: 40,
        fieldSize: MAX_FIELD_BYTES,
        headerPairs: 40
      }
    });
  } catch {
    throw new DocumentRequestError(400, 'INVALID_MULTIPART', '업로드 형식이 올바르지 않습니다.');
  }

  return new Promise((resolve, reject) => {
    const fields = new Map();
    let document = null;
    let fileCount = 0;
    let parserError = null;
    const fail = error => { parserError ??= error; };

    parser.on('field', (name, value, info) => {
      if (info.valueTruncated || fields.has(name) || !['capability', 'payload'].includes(name)) {
        fail(new DocumentRequestError(400, 'INVALID_MULTIPART_FIELDS', '업로드 요청 정보가 올바르지 않습니다.'));
        return;
      }
      fields.set(name, value);
    });

    parser.on('file', (name, stream, info) => {
      fileCount += 1;
      if (fileCount !== 1 || name !== 'file') {
        fail(new DocumentRequestError(400, 'MULTIPLE_DOCUMENTS', '문서 파일은 한 개만 업로드할 수 있습니다.'));
        stream.resume();
        return;
      }

      const chunks = [];
      let size = 0;
      stream.on('limit', () => fail(new DocumentRequestError(413, 'DOCUMENT_TOO_LARGE', '파일 크기는 10MB 이하여야 합니다.')));
      stream.on('data', chunk => {
        size += chunk.length;
        if (size <= MAX_DOCUMENT_BYTES) chunks.push(chunk);
      });
      stream.on('end', () => {
        if (!parserError || parserError.code !== 'DOCUMENT_TOO_LARGE') {
          document = { filename: info.filename, mimeType: info.mimeType, buffer: Buffer.concat(chunks) };
        }
      });
    });

    parser.on('filesLimit', () => fail(new DocumentRequestError(400, 'MULTIPLE_DOCUMENTS', '문서 파일은 한 개만 업로드할 수 있습니다.')));
    parser.on('fieldsLimit', () => fail(new DocumentRequestError(400, 'INVALID_MULTIPART_FIELDS', '업로드 요청 정보가 올바르지 않습니다.')));
    parser.on('partsLimit', () => fail(new DocumentRequestError(400, 'INVALID_MULTIPART_FIELDS', '업로드 요청 정보가 올바르지 않습니다.')));
    parser.on('error', () => fail(new DocumentRequestError(400, 'INVALID_MULTIPART', '업로드 형식이 올바르지 않습니다.')));
    parser.on('finish', () => {
      if (parserError) return reject(parserError);
      if (!document) return reject(new DocumentRequestError(400, 'DOCUMENT_REQUIRED', '문서 파일을 선택해 주세요.'));

      const capability = String(fields.get('capability') ?? '').trim();
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(capability)) {
        return reject(new DocumentRequestError(400, 'INVALID_CAPABILITY', '올바른 capability가 필요합니다.'));
      }
      let payload;
      try {
        payload = JSON.parse(fields.get('payload') ?? '');
      } catch {
        return reject(new DocumentRequestError(400, 'INVALID_PAYLOAD', 'payload JSON 형식이 올바르지 않습니다.'));
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return reject(new DocumentRequestError(400, 'INVALID_PAYLOAD', 'payload는 JSON 객체여야 합니다.'));
      }
      resolve({ capability, payload, document });
    });

    Readable.from([buffer]).pipe(parser);
  });
}
