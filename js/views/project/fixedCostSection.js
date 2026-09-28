import { projectCounts } from '../../engine.js';
import {
  FIXED_COST_ITEMS,
  FIXED_COST_MODES,
  fixedCostBreakdown,
  normalizeFixedCosts
} from '../../fixedCosts.js';
import { escapeHtml, formatWon, number } from '../../utils.js';

const money = value => formatWon(Math.round(number(value)));
const fieldName = (key, field) => `fixedCost-${key}-${field}`;

function modeControl(item, entry) {
  if (item.modes.length === 1) {
    return `${FIXED_COST_MODES[item.modes[0]]}<input type="hidden" name="${fieldName(item.key, 'mode')}" value="${item.modes[0]}">`;
  }
  const options = item.modes
    .map(mode => `<option value="${mode}" ${mode === entry.mode ? 'selected' : ''}>${FIXED_COST_MODES[mode]}</option>`)
    .join('');
  return `<select name="${fieldName(item.key, 'mode')}" aria-label="${escapeHtml(item.label)} 입력 방식">${options}</select>`;
}

function fixedCostRow(item, entry, counts, options) {
  const breakdown = fixedCostBreakdown(item, entry, counts, options);
  const entered = entry.amount > 0;
  const divisorNote = entered && entry.mode === 'total' ? `<small>${breakdown.divisor}명으로 나눔</small>` : '';
  return `
    <tr>
      <th scope="row">${escapeHtml(item.label)}</th>
      <td>${modeControl(item, entry)}</td>
      <td><input type="number" min="0" step="1" name="${fieldName(item.key, 'amount')}" value="${number(entry.amount)}" aria-label="${escapeHtml(item.label)} 금액"></td>
      <td class="number">${entered ? money(breakdown.perPerson) : '-'}${divisorNote}</td>
      <td class="number">${entered ? `${breakdown.students}명` : '-'}</td>
      <td class="number">${entered ? money(breakdown.studentTotal) : '-'}</td>
      <td><input type="text" name="${fieldName(item.key, 'memo')}" value="${escapeHtml(entry.memo)}" placeholder="비고" aria-label="${escapeHtml(item.label)} 비고"></td>
    </tr>`;
}

/** 체험처/비용 화면의 고정비 입력 표. 1인당 금액과 합계는 저장한 인원 기준으로 보여 준다. */
export function renderFixedCostTable(project) {
  const fixedCosts = normalizeFixedCosts(project.fixedCosts);
  const c = projectCounts(project);
  const counts = { participants: c.participants, dayAbsent: c.contractedAbsent, chaperones: c.chaperones };
  const options = { dayAbsentSharesCommonCost: Boolean(project.dayAbsentSharesCommonCost) };
  const rows = FIXED_COST_ITEMS.map(item => fixedCostRow(item, fixedCosts[item.key], counts, options)).join('');
  const absentNote = options.dayAbsentSharesCommonCost && counts.dayAbsent > 0
    ? ` 당일 불참 ${counts.dayAbsent}명도 버스비·숙소비를 부담합니다.`
    : '';

  return `
    <div class="fixed-cost-block" data-fixed-cost-section>
      <h3>고정비</h3>
      <p class="help">전체 계약액은 인원으로 나눠 10원 미만을 버립니다. 버스비는 인솔자 ${counts.chaperones}명과 함께 나눕니다.${absentNote} 금액은 저장하면 다시 계산됩니다.</p>
      <div class="table-wrap">
        <table class="compact-table fixed-cost-table">
          <thead><tr><th>항목</th><th>입력 방식</th><th>금액(원)</th><th>1인당</th><th>학생 수</th><th>학생 합계</th><th>비고</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/** 폼에 고정비 입력칸이 있으면 값을 읽고, 없으면 기존 값을 그대로 돌려준다. */
export function readFixedCostInputs(data, previousFixedCosts) {
  if (!data.has(fieldName(FIXED_COST_ITEMS[0].key, 'amount'))) return normalizeFixedCosts(previousFixedCosts);
  return normalizeFixedCosts(Object.fromEntries(FIXED_COST_ITEMS.map(item => [item.key, {
    mode: data.get(fieldName(item.key, 'mode')),
    amount: data.get(fieldName(item.key, 'amount')),
    memo: String(data.get(fieldName(item.key, 'memo')) ?? '').trim()
  }])));
}
