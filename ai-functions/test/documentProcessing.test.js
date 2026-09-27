import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { executeDocumentRequest } from '../src/ai/documentGateway.js';
import { extractDocumentText } from '../src/documents/extractText.js';
import { DocumentRequestError, MAX_DOCUMENT_BYTES, validateDocumentFile } from '../src/security/documentPolicy.js';
import { parseDocumentMultipartRequest } from '../src/security/documentMultipart.js';

async function createHwpx(entries) {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(entries)) zip.file(name, text);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function makePdf(pageTexts) {
  const fontId = 3 + pageTexts.length * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageTexts.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`
  ];
  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageId = 3 + index * 2;
    const stream = pageTexts[index]
      ? `BT /F1 12 Tf 72 720 Td (${pageTexts[index].replace(/[\\()]/g, '\\$&')}) Tj ET`
      : 'BT /F1 12 Tf ET';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function multipartRequest({ boundary, fields, files, contentType = `multipart/form-data; boundary=${boundary}` }) {
  const chunks = [];
  for (const [name, value] of Object.entries(fields ?? {})) {
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  }
  for (const file of files ?? []) {
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'file'}"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`);
    chunks.push(file.buffer);
    chunks.push('\r\n');
  }
  chunks.push(`--${boundary}--\r\n`);
  const body = Buffer.concat(chunks.map(chunk => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  return {
    method: 'POST',
    headers: { 'content-type': contentType, 'content-length': String(body.length) },
    rawBody: body
  };
}

test('PDF 추출은 페이지 순서를 보존하고 페이지 경계를 텍스트에 남긴다', async () => {
  const text = await extractDocumentText({ filename: 'trip.pdf', buffer: makePdf(['Day 1 Museum', 'Day 2 Palace']) });
  assert.ok(text.indexOf('Day 1 Museum') < text.indexOf('--- 2쪽 ---'));
  assert.ok(text.indexOf('--- 2쪽 ---') < text.indexOf('Day 2 Palace'));
});

test('텍스트가 없는 스캔형 PDF는 OCR을 시도하지 않고 명시적으로 실패한다', async () => {
  await assert.rejects(
    extractDocumentText({ filename: 'scan.pdf', buffer: makePdf(['']) }),
    error => error.code === 'DOCUMENT_TEXT_NOT_FOUND'
  );
});

test('HWPX는 Preview/PrvText.txt를 section XML보다 우선한다', async () => {
  const buffer = await createHwpx({
    'Preview/PrvText.txt': '미리보기 일정\n박물관 방문',
    'Contents/section0.xml': '<hp:t>XML 일정</hp:t>'
  });
  const text = await extractDocumentText({ filename: 'plan.hwpx', buffer });
  assert.match(text, /미리보기 일정/);
  assert.doesNotMatch(text, /XML 일정/);
});

test('HWPX XML fallback은 section 숫자 순서와 표 셀 텍스트, XML entity를 보존한다', async () => {
  const buffer = await createHwpx({
    'Contents/section10.xml': '<hp:p><hp:run><hp:t>열째 일정</hp:t></hp:run></hp:p>',
    'Contents/section2.xml': '<hp:p><hp:run><hp:t>둘째 &amp; 셋째 일정</hp:t></hp:run></hp:p><hp:tbl><hp:tr><hp:tc><hp:p><hp:t>박물관</hp:t></hp:p></hp:tc><hp:tc><hp:p><hp:t>미술관</hp:t></hp:p></hp:tc></hp:tr></hp:tbl>'
  });
  const text = await extractDocumentText({ filename: 'plan.hwpx', buffer });
  assert.ok(text.indexOf('둘째 & 셋째 일정') < text.indexOf('열째 일정'));
  assert.ok(text.indexOf('박물관') < text.indexOf('미술관'));
});

test('multipart parser는 업로드된 한 문서, capability, payload를 메모리에서 읽는다', async () => {
  const request = multipartRequest({
    boundary: 'test-boundary',
    fields: { capability: 'trip-schedule-from-document', payload: JSON.stringify({ projectTitle: '수학여행' }) },
    files: [{ filename: 'trip.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') }]
  });
  const parsed = await parseDocumentMultipartRequest(request);
  assert.equal(parsed.capability, 'trip-schedule-from-document');
  assert.deepEqual(parsed.payload, { projectTitle: '수학여행' });
  assert.deepEqual(parsed.document.buffer, Buffer.from('%PDF-1.4 sample'));
  assert.equal(parsed.document.filename, 'trip.pdf');
});

test('PDF/HWPX multipart 문서는 추출한 서버 텍스트만 고정 capability에 전달한다', async () => {
  for (const document of [
    { filename: 'trip.pdf', mimeType: 'application/pdf', buffer: makePdf(['2026-05-12 Museum Visit']) },
    { filename: 'trip.hwpx', mimeType: 'application/zip', buffer: await createHwpx({ 'Preview/PrvText.txt': '2026-05-13 Aquarium Visit' }) }
  ]) {
    const req = multipartRequest({
      boundary: `e2e-${document.filename}`,
      fields: {
        capability: 'trip-schedule-from-document',
        payload: JSON.stringify({ documentText: 'client-forged-text', projectTitle: '2학년 수학여행', schoolYear: '2026' })
      },
      files: [document]
    });
    let providerRequest;
    const result = await executeDocumentRequest(req, {
      runtimeConfig: { provider: 'ollama', defaultModel: 'model-test' },
      providerSecrets: {},
      providerInstance: {
        async generate(request) {
          providerRequest = request;
          return { text: JSON.stringify({ items: [{ date: '', name: 'Museum Visit', arrivalTime: '', departureTime: '', address: '', contact: '' }] }) };
        }
      }
    });

    assert.equal(result.status, 200);
    assert.match(providerRequest.messages[1].content, /2학년 수학여행/);
    assert.doesNotMatch(providerRequest.messages[1].content, /client-forged-text/);
    assert.match(providerRequest.messages[1].content, document.filename.endsWith('.pdf') ? /2026-05-12 Museum Visit/ : /2026-05-13 Aquarium Visit/);
  }
});

test('multipart parser는 복수 파일, 잘못된 boundary, 최대 크기 초과를 거절한다', async () => {
  const multiple = multipartRequest({
    boundary: 'two-files',
    fields: { capability: 'trip-schedule-from-document', payload: '{}' },
    files: [
      { filename: 'one.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
      { filename: 'two.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }
    ]
  });
  await assert.rejects(parseDocumentMultipartRequest(multiple), error => error.code === 'MULTIPLE_DOCUMENTS');

  const malformed = multipartRequest({ boundary: 'bad', fields: {}, files: [], contentType: 'multipart/form-data' });
  await assert.rejects(parseDocumentMultipartRequest(malformed), error => error.code === 'INVALID_MULTIPART');

  const oversized = { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(MAX_DOCUMENT_BYTES + 70_000) }, rawBody: Buffer.alloc(0) };
  await assert.rejects(parseDocumentMultipartRequest(oversized), error => error.status === 413 && error.code === 'PAYLOAD_TOO_LARGE');

  const invalidBody = { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, rawBody: { length: 12 } };
  await assert.rejects(parseDocumentMultipartRequest(invalidBody), error => error.code === 'INVALID_MULTIPART');
});

test('문서 정책은 PDF/HWPX 형식만 받고 MIME 불일치, HWP, 크기 초과를 거절한다', async () => {
  const pdf = validateDocumentFile({ filename: 'trip.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 file') });
  const hwpxBuffer = await createHwpx({ 'Preview/PrvText.txt': '일정' });
  const hwpx = validateDocumentFile({ filename: 'trip.hwpx', mimeType: 'application/octet-stream', buffer: hwpxBuffer });
  assert.equal(pdf.filename, 'trip.pdf');
  assert.equal(hwpx.filename, 'trip.hwpx');
  assert.throws(() => validateDocumentFile({ filename: 'trip.pdf', mimeType: 'image/jpeg', buffer: Buffer.from('%PDF-1.4') }), DocumentRequestError);
  assert.throws(() => validateDocumentFile({ filename: 'trip.hwpx', mimeType: 'image/jpeg', buffer: hwpxBuffer }), error => error.code === 'DOCUMENT_MIME_MISMATCH');
  assert.throws(() => validateDocumentFile({ filename: 'trip.hwp', mimeType: 'application/x-hwp', buffer: Buffer.from('HWP') }), error => error.code === 'UNSUPPORTED_DOCUMENT_TYPE');
  assert.throws(() => validateDocumentFile({ filename: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(MAX_DOCUMENT_BYTES + 1) }), error => error.status === 413);
});
