import { loadScript } from '../services/scriptLoader.js';

/**
 * 견본 한글 파일(templates/*-hwpx)로 HWPX 파일을 만든다.
 * 견본의 글꼴·테두리·쪽 설정(header.xml)과 표 앞뒤 부분(section-head/tail)을 그대로 쓰고, 표만 새로 넣는다.
 */
const JSZIP_URL = new URL('../../vendor/jszip/jszip.min.js', import.meta.url).href;

const TEMPLATE_FILES = ['mimetype', 'version.xml', 'settings.xml', 'Contents/header.xml', 'Contents/content.hpf',
  'Contents/section-head.xml', 'Contents/section-tail.xml', 'META-INF/container.xml', 'META-INF/container.rdf', 'META-INF/manifest.xml'];

export const escapeXml = text => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function loadJsZip() {
  if (!globalThis.JSZip) await loadScript(JSZIP_URL);
  return globalThis.JSZip;
}

async function templateTexts(templateName) {
  const base = new URL(`../../templates/${templateName}/`, import.meta.url);
  return Object.fromEntries(await Promise.all(TEMPLATE_FILES.map(async path => {
    const response = await fetch(new URL(path, base));
    if (!response.ok) throw new Error(`양식 파일(${path})을 불러오지 못했습니다.`);
    return [path, await response.text()];
  })));
}

function contentHpf(template, title) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return template
    .replace(/<opf:title>[^<]*<\/opf:title>/, `<opf:title>${escapeXml(title)}</opf:title>`)
    .replace(/(name="CreatedDate" content="text">)[^<]*/, `$1${now}`)
    .replace(/(name="ModifiedDate" content="text">)[^<]*/, `$1${now}`);
}

/**
 * HWPX 파일 내용(Blob).
 * tableXml: 넣을 표(hp:tbl), previewText: 파일 미리보기 글자, title: 문서 제목
 */
export async function buildHwpx(templateName, { tableXml, previewText = '', title = '' }) {
  const JSZip = await loadJsZip();
  const text = await templateTexts(templateName);
  const zip = new JSZip();
  const add = (path, data, options = {}) => zip.file(path, data, { createFolders: false, ...options });
  // mimetype은 압축하지 않고 맨 앞에 둔다(HWPX 규칙).
  add('mimetype', text.mimetype.trim(), { compression: 'STORE' });
  add('version.xml', text['version.xml']);
  add('Contents/header.xml', text['Contents/header.xml']);
  add('Contents/section0.xml', text['Contents/section-head.xml'] + tableXml + text['Contents/section-tail.xml']);
  add('Preview/PrvText.txt', previewText.replace(/\r?\n/g, '\r\n'));
  add('settings.xml', text['settings.xml']);
  add('META-INF/container.xml', text['META-INF/container.xml']);
  add('META-INF/manifest.xml', text['META-INF/manifest.xml']);
  add('META-INF/container.rdf', text['META-INF/container.rdf']);
  add('Contents/content.hpf', contentHpf(text['Contents/content.hpf'], title));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
