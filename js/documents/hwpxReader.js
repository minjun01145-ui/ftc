import { loadScript } from '../services/scriptLoader.js';
import { DocumentReadError } from './documentReadError.js';

/**
 * HWPX(한글 문서의 압축 XML 형식)에서 표와 문단을 읽는다. 저장소에 포함한 JSZip(vendor/jszip)으로
 * 브라우저 안에서만 읽으며, 파일을 밖으로 보내지 않는다.
 *
 * 결과: { tables: [[{ cells: [{ col, text }] }]], paragraphs: [text] }
 *   - 표 안의 표(중첩 표)는 따로 하나의 표로 읽는다.
 *   - 셀의 col은 HWPX가 적어 둔 열 번호(cellAddr colAddr)다.
 */
const JSZIP_URL = new URL('../../vendor/jszip/jszip.min.js', import.meta.url).href;

async function loadJsZip() {
  if (!globalThis.JSZip) await loadScript(JSZIP_URL);
  return globalThis.JSZip;
}

const byLocalName = (node, name) => [...node.getElementsByTagNameNS('*', name)];
const closestAncestor = (node, name) => {
  for (let current = node.parentNode; current; current = current.parentNode) {
    if (current.localName === name) return current;
  }
  return null;
};

// 표는 문단 안에 들어 있으므로, 문단 글자를 모을 때 그 안에 든 표의 글자는 빼야 한다.
function paragraphText(paragraph) {
  const ownTable = closestAncestor(paragraph, 'tbl');
  return byLocalName(paragraph, 't')
    .filter(node => closestAncestor(node, 'tbl') === ownTable)
    .map(node => node.textContent)
    .join('');
}

function cellText(cell) {
  return byLocalName(cell, 'p')
    .filter(paragraph => closestAncestor(paragraph, 'tc') === cell)
    .map(paragraphText)
    .join('\n')
    .trim();
}

function readTable(table) {
  return byLocalName(table, 'tr')
    .filter(row => closestAncestor(row, 'tbl') === table)
    .map(row => ({
      cells: byLocalName(row, 'tc')
        .filter(cell => closestAncestor(cell, 'tr') === row)
        .map((cell, index) => {
          const address = byLocalName(cell, 'cellAddr').find(node => closestAncestor(node, 'tc') === cell);
          const col = Number(address?.getAttribute('colAddr'));
          return { col: Number.isInteger(col) ? col : index, text: cellText(cell) };
        })
    }));
}

function sectionOrder(name) {
  return Number(name.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
}

export async function readHwpxDocument(file) {
  const JSZip = await loadJsZip();
  let archive;
  try {
    archive = await JSZip.loadAsync(await file.arrayBuffer());
  } catch (error) {
    throw new DocumentReadError('HWPX 문서를 열지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.', { code: 'INVALID_HWPX_ARCHIVE', cause: error });
  }
  const sections = Object.keys(archive.files)
    .filter(name => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((left, right) => sectionOrder(left) - sectionOrder(right));
  if (!sections.length) throw new DocumentReadError('HWPX 문서에서 본문을 찾지 못했습니다.', { code: 'INVALID_HWPX_ARCHIVE' });

  const parser = new DOMParser();
  const tables = [];
  const paragraphs = [];
  for (const name of sections) {
    const xml = parser.parseFromString(await archive.file(name).async('string'), 'application/xml');
    tables.push(...byLocalName(xml, 'tbl').map(readTable));
    paragraphs.push(...byLocalName(xml, 'p').filter(paragraph => !closestAncestor(paragraph, 'tbl')).map(paragraphText).filter(text => text.trim()));
  }
  return { tables, paragraphs };
}
