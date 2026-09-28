import { DocumentReadError } from './documentReadError.js';

/**
 * PDF 파일에서 쪽마다 글자 조각과 위치를 읽는다. 저장소에 포함한 PDF.js(vendor/pdfjs)로
 * 브라우저 안에서만 읽으며, 파일을 밖으로 보내지 않는다.
 *
 * 결과: [{ pageNumber, items: [{ text, x, y }] }]  (x, y는 PDF 좌표, y가 클수록 위쪽)
 */
const PDFJS_URL = new URL('../../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
const WORKER_URL = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const CMAP_URL = new URL('../../vendor/pdfjs/cmaps/', import.meta.url).href;

let pdfjsReady = null;

function loadPdfJs() {
  pdfjsReady ??= import(PDFJS_URL).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
    return pdfjs;
  });
  return pdfjsReady;
}

export async function readPdfLayout(file) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    isEvalSupported: false
  });
  try {
    const document = await task.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        pageNumber,
        items: content.items
          .filter(item => typeof item.str === 'string' && item.str.trim())
          .map(item => ({ text: item.str, x: Math.round(item.transform[4]), y: Math.round(item.transform[5]) }))
      });
    }
    return pages;
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new DocumentReadError('암호가 걸린 PDF는 읽을 수 없습니다. 암호를 풀고 다시 올려 주세요.', { code: 'DOCUMENT_ENCRYPTED', cause: error });
    }
    throw new DocumentReadError('PDF를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.', { code: 'DOCUMENT_EXTRACTION_FAILED', cause: error });
  } finally {
    await task.destroy();
  }
}
