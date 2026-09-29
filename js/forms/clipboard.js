/**
 * 한글(HWP)에 붙여넣을 표 복사. 서식(HTML)과 글자(탭 구분)를 함께 복사한다.
 * 한글은 HTML 표를 붙여넣으면 병합·테두리·음영을 표로 살려 준다.
 */
export async function copyRichText(html, text) {
  const wrapped = `<html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  if (globalThis.ClipboardItem && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([wrapped], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]);
      return;
    } catch {
      // 아래 방법으로 다시 시도한다.
    }
  }
  const holder = document.createElement('div');
  holder.contentEditable = 'true';
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;';
  holder.innerHTML = html;
  document.body.append(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const copied = document.execCommand('copy');
  selection.removeAllRanges();
  holder.remove();
  if (!copied) throw new Error('브라우저가 복사를 허용하지 않았습니다.');
}

const STYLE_KEYS = ['background-color', 'color', 'font-weight', 'text-align', 'vertical-align'];

function hexColor(value) {
  const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match || match[4] === '0') return '';
  return `#${match.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 화면에 보이는 표를 인라인 스타일만 쓰는 표로 바꾼다(색·굵기·정렬을 그대로 옮기고 테두리는 검은 실선).
 * 입력칸·버튼은 글자로 바꾸거나 뺀다.
 */
export function tableForPaste(table) {
  const clone = table.cloneNode(true);
  const sourceCells = [...table.querySelectorAll('th, td')];
  const cloneCells = [...clone.querySelectorAll('th, td')];
  sourceCells.forEach((cell, index) => {
    const style = getComputedStyle(cell);
    const parts = STYLE_KEYS
      .map(key => [key, style.getPropertyValue(key)])
      .filter(([key, value]) => value && !(key === 'background-color' && /rgba\(0, 0, 0, 0\)|transparent/.test(value)))
      .map(([key, value]) => `${key}:${value}`);
    const target = cloneCells[index];
    target.setAttribute('style', `border:1px solid #000;padding:3px 5px;font-size:10pt;${parts.join(';')}`);
    // 한글은 CSS보다 표 속성을 잘 읽는다.
    const background = hexColor(style.getPropertyValue('background-color'));
    if (background) target.setAttribute('bgcolor', background);
    target.setAttribute('align', style.getPropertyValue('text-align') === 'right' ? 'right' : (style.getPropertyValue('text-align') === 'center' ? 'center' : 'left'));
    target.setAttribute('valign', 'middle');
    target.removeAttribute('class');
    target.querySelectorAll('input, select, textarea').forEach(input => input.replaceWith(document.createTextNode(input.value ?? '')));
    target.querySelectorAll('button').forEach(button => button.remove());
  });
  clone.querySelectorAll('tr, thead, tbody, tfoot').forEach(node => node.removeAttribute('class'));
  clone.setAttribute('style', "border-collapse:collapse;width:100%;font-family:'맑은 고딕',sans-serif;");
  clone.setAttribute('border', '1');
  clone.setAttribute('cellspacing', '0');
  clone.setAttribute('cellpadding', '3');
  clone.setAttribute('width', '100%');
  clone.removeAttribute('class');
  const text = [...table.querySelectorAll('tr')]
    .map(row => [...row.querySelectorAll('th, td')].map(cell => cell.innerText.replace(/\s+/g, ' ').trim()).join('\t'))
    .join('\n');
  return { html: clone.outerHTML, text };
}
