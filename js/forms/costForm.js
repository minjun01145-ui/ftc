import { studentCostLines } from '../costLines.js';
import { koreanDateLabel } from '../dates.js';
import { projectCounts } from '../engine.js';
import { activeFixedCosts, fixedCostBreakdown, fixedCostLineId } from '../fixedCosts.js';
import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, VULNERABLE_BUDGET_ID, buildProposal } from '../proposalPlanner.js';
import { escapeHtml, number } from '../utils.js';

/**
 * 가정통신문·계획서에 넣는 '현장체험학습 경비 산출내역' (일자 | 경비 산출).
 * - 날짜별 체험처 비용을 '항목: 금액' 목록으로, 기타비(숙박비·보험·차량비 등)는 항목마다 한 줄로 둔다.
 * - 1인당 경비와 지원금·학부모 부담 안내(※)를 붙인다.
 *
 * model = {
 *   rows: [{ label: [줄], items: [줄], kind: 'date' | 'fixed' }],
 *   perPerson,
 *   notes: ['※ ...']
 * }
 */
export const COST_FORM_TITLE = '현장체험학습 경비 산출내역';

const won = value => `${Math.round(number(value)).toLocaleString('ko-KR')}원`;

// 이름에 이미 ':'가 있으면(예: '조식: 숙소식') 금액은 쉼표 뒤에 쓴다(견본과 같은 모양).
const amountText = (name, amount) => (name.includes(':') ? `${name}, ${amount}` : `${name}: ${amount}`);

function fixedItem(line, entry, counts, options) {
  const memo = line.description ? `(${line.description})` : '';
  if (!entry || entry.mode !== 'total') return `${amountText(line.name, won(line.perPerson))}${memo}`;
  // 전체 계약액을 나눈 항목은 계산식을 보여 준다. 예) 차량비: 9,000,000원 ÷ 79명 = 113,920원
  const breakdown = fixedCostBreakdown(entry, counts, options);
  return `${line.name}: ${won(breakdown.amount)} ÷ ${breakdown.divisor}명 = ${won(breakdown.perPerson)}${memo}`;
}

function supportNotes(project, perPersonTotal) {
  const proposal = buildProposal(project);
  const block = id => proposal.blocks.find(item => item.budget.id === id);
  // 품의 도우미에서 배정한 1인당 금액을 쓰고, 아직 배정하지 않았으면 예산 관리의 1인당 지원액을 쓴다.
  const perPersonOf = item => (item.usedPerPerson > 0
    ? item.usedPerPerson
    : (Number.isFinite(item.budget.capPerPerson) ? Math.min(item.budget.capPerPerson, perPersonTotal) : 0));
  const supports = proposal.blocks
    .filter(item => ![VULNERABLE_BUDGET_ID, STUDENT_BUDGET_ID].includes(item.budget.id))
    .map(item => ({
      name: item.budget.id === EDUCATION_BUDGET_ID ? '교육청 예산' : item.budget.name.replace(/^기타 지원금\((.*)\)$/, '$1'),
      amount: perPersonOf(item)
    }))
    .filter(item => item.amount > 0);

  const notes = [];
  let supported = 0;
  let remaining = perPersonTotal;
  const applied = supports.map(item => {
    const amount = Math.min(item.amount, remaining);
    remaining -= amount;
    supported += amount;
    return { ...item, amount };
  }).filter(item => item.amount > 0);
  if (applied.length) notes.push(`※ ${applied.map(item => `${item.name}(1인당 ${won(item.amount)})`).join(' 및 ')} 지원`);
  notes.push(`※ 학부모 부담 금액(예상액): 1인당 총 ${won(Math.max(0, perPersonTotal - supported))}`);

  const vulnerable = block(VULNERABLE_BUDGET_ID);
  if (proposal.counts.vulnerable > 0) {
    notes.push(Number.isFinite(vulnerable.budget.capPerPerson)
      ? `※ 취약계층 학생은 교육청 예산(1인당 ${won(vulnerable.budget.capPerPerson)}) 지원`
      : '※ 취약계층 학생은 교육청 예산으로 전액 지원');
  }
  return notes;
}

export function costFormModel(project) {
  const lines = studentCostLines(project);
  const c = projectCounts(project);
  const counts = { participants: c.participants, dayAbsent: c.contractedAbsent, chaperones: c.chaperones };
  const options = { dayAbsentSharesCommonCost: Boolean(project.dayAbsentSharesCommonCost) };
  const entryByLine = new Map(activeFixedCosts(project.fixedCosts).map(entry => [fixedCostLineId(entry), entry]));

  const rows = [];
  for (const line of lines.filter(item => !item.isFixedCost)) {
    const label = koreanDateLabel(line.date) || '기타';
    const last = rows.at(-1);
    const item = amountText(line.name, won(line.perPerson));
    if (last && last.kind === 'date' && last.label[0] === label) last.items.push(item);
    else rows.push({ kind: 'date', label: [label], items: [item] });
  }
  for (const line of lines.filter(item => item.isFixedCost)) {
    rows.push({ kind: 'fixed', label: [line.name], items: [fixedItem(line, entryByLine.get(line.id), counts, options)] });
  }
  const perPerson = lines.reduce((sum, line) => sum + line.perPerson, 0);
  return { rows, perPerson, notes: supportNotes(project, perPerson) };
}

/* ---------- HTML(화면 미리보기, 한글 붙여넣기) ---------- */

const FONT = "font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:10pt;";
const CELL = `border:1px solid #000;${FONT}padding:3px 6px;vertical-align:middle;`;
const lines = list => list.map(escapeHtml).join('<br>');

/** 인라인 스타일과 표 속성만 쓰는 표. 한글에 붙여넣어도 테두리·음영이 남는다. */
export function costFormHtml(model, { title = COST_FORM_TITLE } = {}) {
  const head = `<tr>
    <th width="24%" bgcolor="#F0F0F0" align="center" valign="middle" style="${CELL}background:#F0F0F0;font-weight:normal;text-align:center;">일자</th>
    <th width="76%" bgcolor="#F0F0F0" align="center" valign="middle" style="${CELL}background:#F0F0F0;font-weight:normal;text-align:center;">경비 산출</th>
  </tr>`;
  const body = model.rows.map((row, index) => {
    const lastItem = index === model.rows.length - 1 ? 'border-bottom:3px double #000;' : '';
    return `<tr>
      <td align="center" valign="middle" style="${CELL}text-align:center;${lastItem}">${lines(row.label)}</td>
      <td align="left" valign="middle" style="${CELL}text-align:left;${lastItem}">${row.items.map(item => `• ${escapeHtml(item)}`).join('<br>')}</td>
    </tr>`;
  }).join('');
  const total = `<tr>
    <td align="center" valign="middle" style="${CELL}text-align:center;">1인당 경비</td>
    <td align="center" valign="middle" style="${CELL}text-align:center;">${escapeHtml(won(model.perPerson))}</td>
  </tr>`;
  const notes = model.notes.length
    ? `<tr><td colspan="2" align="left" valign="middle" style="${CELL}text-align:left;">${lines(model.notes)}</td></tr>`
    : '';
  const empty = model.rows.length ? '' : `<tr><td colspan="2" align="center" style="${CELL}text-align:center;">비용 항목이 없습니다.</td></tr>`;
  return `<p style="${FONT}font-size:12pt;font-weight:bold;margin:0 0 6px;">${escapeHtml(title)}</p>`
    + `<table border="1" cellspacing="0" cellpadding="3" width="100%" style="border-collapse:collapse;border:2px solid #000;${FONT}">`
    + `<thead>${head}</thead><tbody>${body}${empty}${total}${notes}</tbody></table>`;
}

/** 붙여넣기용 일반 글자(탭으로 칸 구분). */
export function costFormText(model) {
  return [
    '일자\t경비 산출',
    ...model.rows.map(row => `${row.label.join(' ')}\t${row.items.join(' / ')}`),
    `1인당 경비\t${won(model.perPerson)}`,
    ...model.notes
  ].join('\n');
}
