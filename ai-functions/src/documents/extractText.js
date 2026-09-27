import JSZip from 'jszip';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const MAX_EXTRACTED_TEXT_CHARS = 200_000;
const MAX_HWPX_TEXT_ENTRIES_BYTES = 24 * 1024 * 1024;

export class DocumentProcessingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'DocumentProcessingError';
    this.status = status;
    this.code = code;
  }
}

export async function extractDocumentText({ filename, buffer }) {
  const extension = String(filename ?? '').toLowerCase().match(/\.([^.]+)$/)?.[1];
  if (extension === 'pdf') return extractPdfText(buffer);
  if (extension === 'hwpx') return extractHwpxText(buffer);
  throw new DocumentProcessingError(415, 'UNSUPPORTED_DOCUMENT_TYPE', 'PDF 또는 HWPX 파일만 사용할 수 있습니다.');
}

async function extractPdfText(buffer) {
  let loadingTask;
  let document;
  try {
    loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false
    });
    document = await loadingTask.promise;
    const pages = [];
    let totalCharacters = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => {
        if (typeof item.str !== 'string') return '';
        return item.hasEOL ? `${item.str}\n` : `${item.str} `;
      }).join('').replace(/[ \t]+\n/g, '\n').trim();
      totalCharacters += text.length + 32;
      if (totalCharacters > MAX_EXTRACTED_TEXT_CHARS) {
        throw new DocumentProcessingError(413, 'DOCUMENT_TEXT_TOO_LARGE', '문서에서 추출한 텍스트가 너무 많습니다.');
      }
      pages.push(`--- ${pageNumber}쪽 ---\n${text}`);
    }

    const extracted = pages.join('\n\n').trim();
    if (!extracted || !pages.some(page => page.replace(/--- \d+쪽 ---/g, '').trim())) {
      throw new DocumentProcessingError(422, 'DOCUMENT_TEXT_NOT_FOUND', 'PDF에서 텍스트를 찾지 못했습니다. 스캔 이미지 PDF는 읽을 수 없습니다.');
    }
    return extracted;
  } catch (error) {
    if (error instanceof DocumentProcessingError) throw error;
    throw new DocumentProcessingError(422, 'DOCUMENT_EXTRACTION_FAILED', 'PDF를 읽지 못했습니다. 파일이 손상되었거나 암호가 설정되어 있는지 확인해 주세요.');
  } finally {
    try { await loadingTask?.destroy?.(); } catch { /* Ignore PDF.js cleanup errors. */ }
  }
}

async function extractHwpxText(buffer) {
  try {
    return await extractHwpxArchiveText(buffer);
  } catch (error) {
    if (error instanceof DocumentProcessingError) throw error;
    throw new DocumentProcessingError(422, 'DOCUMENT_EXTRACTION_FAILED', 'HWPX 문서를 읽지 못했습니다. 파일이 손상되었는지 확인해 주세요.');
  }
}

async function extractHwpxArchiveText(buffer) {
  let archive;
  try {
    archive = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  } catch {
    throw new DocumentProcessingError(422, 'INVALID_HWPX_ARCHIVE', 'HWPX 문서 압축 구조를 읽지 못했습니다.');
  }

  const preview = archive.file('Preview/PrvText.txt');
  if (preview) {
    const declaredSize = getUncompressedSize(preview);
    if (declaredSize > MAX_HWPX_TEXT_ENTRIES_BYTES) {
      throw new DocumentProcessingError(413, 'DOCUMENT_TEXT_TOO_LARGE', '문서에서 추출한 텍스트가 너무 많습니다.');
    }
    const previewText = cleanText(await preview.async('string'));
    if (previewText) return ensureExtractedTextSize(previewText);
  }

  const sections = Object.entries(archive.files)
    .map(([name, entry]) => ({ name, entry, match: name.match(/^Contents\/section(\d+)\.xml$/i) }))
    .filter(item => !item.entry.dir && item.match)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  if (!sections.length) {
    throw new DocumentProcessingError(422, 'INVALID_HWPX_ARCHIVE', 'HWPX 문서에서 일정 내용을 찾을 수 없습니다.');
  }

  const totalXmlBytes = sections.reduce((sum, section) => sum + getUncompressedSize(section.entry), 0);
  if (totalXmlBytes > MAX_HWPX_TEXT_ENTRIES_BYTES) {
    throw new DocumentProcessingError(413, 'DOCUMENT_TEXT_TOO_LARGE', '문서에서 추출한 텍스트가 너무 많습니다.');
  }

  const sectionTexts = [];
  let totalCharacters = 0;
  for (const section of sections) {
    const xml = await section.entry.async('string');
    const text = cleanText(xml.replace(/<\/(?:[\w.-]+:)?(?:p|tc|tr|tbl)\s*>/gi, '\n'));
    if (!text) continue;
    totalCharacters += text.length;
    if (totalCharacters > MAX_EXTRACTED_TEXT_CHARS) {
      throw new DocumentProcessingError(413, 'DOCUMENT_TEXT_TOO_LARGE', '문서에서 추출한 텍스트가 너무 많습니다.');
    }
    sectionTexts.push(text);
  }

  const extracted = sectionTexts.join('\n\n').trim();
  if (!extracted) {
    throw new DocumentProcessingError(422, 'DOCUMENT_TEXT_NOT_FOUND', 'HWPX 문서에서 읽을 수 있는 텍스트를 찾지 못했습니다.');
  }
  return extracted;
}

function getUncompressedSize(entry) {
  const size = Number(entry?._data?.uncompressedSize);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new DocumentProcessingError(422, 'INVALID_HWPX_ARCHIVE', 'HWPX 문서 압축 정보를 확인할 수 없습니다.');
  }
  return size;
}

function ensureExtractedTextSize(text) {
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new DocumentProcessingError(413, 'DOCUMENT_TEXT_TOO_LARGE', '문서에서 추출한 텍스트가 너무 많습니다.');
  }
  return text;
}

function cleanText(value) {
  return decodeXmlEntities(String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u0000/g, ' '))
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeXmlEntities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    const key = entity.toLowerCase();
    if (Object.hasOwn(named, key)) return named[key];
    const codePoint = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return match;
    try { return String.fromCodePoint(codePoint); } catch { return match; }
  });
}
