import { studentCostLines, sumLines } from '../../costLines.js';
import { projectCounts } from '../../engine.js';
import { koreanDateLabel } from '../../dates.js';
import { escapeHtml, number } from '../../utils.js';

const won = value => Math.round(number(value)).toLocaleString('ko-KR');

/**
 * 표의 첫 칸(항목). 날짜가 있는 항목은 같은 날짜끼리 묶어 한 번만 쓰고(엑셀 병합 셀과 같은 모양),
 * 고정비는 항목 이름을 쓴다.
 */
function withGroupCells(lines) {
  return lines.map((line, index) => {
    if (line.isFixedCost || !line.date) return { line, group: line.isFixedCost ? line.name : '', span: 1 };
    if (index > 0 && !lines[index - 1].isFixedCost && lines[index - 1].date === line.date) return { line, group: null, span: 0 };
    let span = 1;
    while (lines[index + span] && !lines[index + span].isFixedCost && lines[index + span].date === line.date) span += 1;
    return { line, group: koreanDateLabel(line.date), span };
  });
}

// 기타비는 1인당 금액이 어떻게 나왔는지(1인당 입력 / 총액 ÷ 학생 / 총액 ÷ 학생+인솔자)를 적는다.
function noteText(line, counts) {
  if (line.isFixedCost) return line.basis;
  const notes = [];
  if (line.includesDayAbsent && counts.contractedAbsent > 0) notes.push(`당일 불참 ${counts.contractedAbsent}명 포함`);
  if (line.note) notes.push(line.note);
  return notes.join(', ');
}

function rowHtml({ line, group, span }, counts) {
  const groupCell = span > 0 ? `<th scope="row" rowspan="${span}">${escapeHtml(group)}</th>` : '';
  const content = line.isFixedCost ? line.description || line.name : line.name;
  return `
    <tr>
      ${groupCell}
      <td>${escapeHtml(content)}</td>
      <td class="number">${won(line.perPerson)}</td>
      <td class="number">${number(line.quantity)}</td>
      <td class="number">${won(line.total)}</td>
      <td>${escapeHtml(noteText(line, counts))}</td>
    </tr>`;
}

export function renderPreTripSection(project) {
  const lines = studentCostLines(project);
  const counts = projectCounts(project);
  const body = lines.length
    ? withGroupCells(lines).map(row => rowHtml(row, counts)).join('')
    : '<tr><td colspan="6" class="center">단가를 입력한 체험처/비용 항목이 없습니다.</td></tr>';

  return `
    <section class="pre-trip-sheet" data-project-section="preTrip">
      <h2>학생 1인별 금액 산출 내역</h2>
      <p class="help">실제 참여 ${counts.participants}명 · 당일 불참 ${counts.contractedAbsent}명 · 인솔자 ${counts.chaperones}명 기준입니다. 금액이 없는 일정은 표시하지 않습니다.</p>
      <div class="table-wrap">
        <table class="compact-table sheet-table">
          <thead><tr><th>항목</th><th>내용</th><th>금액(원)</th><th>학생 수</th><th>해당 항목 총액</th><th>비고</th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr class="total"><th colspan="2">합계</th><td class="number">${won(sumLines(lines, 'perPerson'))}</td><td></td><td class="number">${won(sumLines(lines, 'total'))}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
      <div class="page-actions no-print"><button type="button" data-action="print">인쇄</button></div>
    </section>`;
}
