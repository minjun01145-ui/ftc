import { SETTLEMENT_COLUMNS, buildSettlementReport, settlementRowTsv } from '../../settlementReport.js';
import { escapeHtml } from '../../utils.js';

function displayValue(value) {
  if (typeof value === 'number') return value.toLocaleString('ko-KR');
  return String(value ?? '');
}

function copyButton(text, label = '복사') {
  if (text === '' || text === null || text === undefined) return '';
  return `<button type="button" class="small-button" data-action="copy-text" data-copy-text="${escapeHtml(String(text))}">${label}</button>`;
}

function valueRow(column, values) {
  const value = values[column.key];
  const hints = [];
  if (column.merged) hints.push(`${column.merged} 병합 칸`);
  if (column.formula) hints.push('서식에 수식이 있어 자동 계산됩니다');
  if (column.hint) hints.push(column.hint);
  const empty = value === '' || value === null || value === undefined;
  return `
    <tr class="${column.formula ? 'formula-row' : ''}">
      <th scope="row" class="center">${column.col}</th>
      <td>${escapeHtml(column.label)}</td>
      <td class="settlement-value ${typeof value === 'number' ? 'number' : ''}">${empty ? '<span class="warn-text">미입력</span>' : escapeHtml(displayValue(value))}</td>
      <td class="center">${column.formula ? '' : copyButton(value)}</td>
      <td class="help">${escapeHtml(hints.join(' · '))}</td>
    </tr>`;
}

export function renderSettlementSection(project, school = {}) {
  const { values, warnings } = buildSettlementReport(project, school);
  const rows = SETTLEMENT_COLUMNS.filter(column => column.key !== 'remarks').map(column => valueRow(column, values)).join('');
  const warningHtml = warnings.length
    ? `<ul class="settlement-warnings">${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
    : '<p class="ok-text">입력에 필요한 값이 모두 준비되었습니다.</p>';

  return `
    <section class="settlement-helper" data-project-section="settlement">
      <div class="proposal-howto">
        <strong>교육청 정산 서식 입력 도우미</strong>
        <p>「2026학년도 (초6·중2·고2) 현장체험학습비 지원금 정산」 서식 7행에 넣을 값입니다. 체험학습을 마친 뒤 인원·비용·예산 배정을 실제대로 고친 다음 확인하세요.</p>
        <p>값 옆의 <b>복사</b>를 눌러 해당 칸에 붙여넣거나, <b>7행 한 줄 복사</b> 후 B7 칸을 선택하고 붙여넣으세요. 병합 칸 때문에 한 줄 붙여넣기가 안 되면 칸별로 복사하세요.</p>
      </div>
      ${warningHtml}
      <div class="toolbar no-print">${copyButton(settlementRowTsv(values), '7행 한 줄 복사(B7부터)')}</div>
      <div class="table-wrap">
        <table class="compact-table settlement-table">
          <thead><tr><th>열</th><th>항목</th><th>입력할 값</th><th>복사</th><th>안내</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <h3>X열 비고</h3>
      <p class="help">학교·외부 지원 내역과 당일 불참자 공통경비를 서식 예시와 같은 모양으로 만들었습니다.</p>
      <pre class="settlement-remarks">${escapeHtml(values.remarks || '(비고에 적을 내용이 없습니다)')}</pre>
      <div class="toolbar no-print">${copyButton(values.remarks, '비고 복사')}</div>
      <div class="page-actions no-print"><button type="button" data-action="print">인쇄</button></div>
    </section>`;
}
