import { projectCounts } from '../../engine.js';
import {
  FIXED_COST_ITEMS,
  FIXED_COST_MODES,
  fixedCostBasisText,
  fixedCostBreakdown,
  normalizeFixedCosts
} from '../../fixedCosts.js';
import { escapeHtml, formatWon, number } from '../../utils.js';

const money = value => formatWon(Math.round(number(value)));
const fieldName = (key, field) => `fixedCost-${key}-${field}`;

function modeCell(item, entry) {
  const options = Object.entries(FIXED_COST_MODES)
    .map(([mode, label]) => `<option value="${mode}" ${mode === entry.mode ? 'selected' : ''}>${label}</option>`)
    .join('');
  const isTotal = entry.mode === 'total';
  return `
    <div class="fixed-cost-mode">
      <select name="${fieldName(item.key, 'mode')}" data-fixed-cost-mode aria-label="${escapeHtml(item.label)} 입력 방식">${options}</select>
      <label class="check-label" title="전체 계약액을 학생 + 인솔자 수로 나눕니다">
        <input type="checkbox" name="${fieldName(item.key, 'includeChaperones')}" data-fixed-cost-chaperones
          ${entry.includeChaperones ? 'checked' : ''} ${isTotal ? '' : 'disabled'}> 인솔자도 함께 부담
      </label>
    </div>`;
}

function fixedCostRow(item, entry, counts, options) {
  const breakdown = fixedCostBreakdown(item, entry, counts, options);
  const entered = entry.amount > 0;
  return `
    <tr>
      <th scope="row">${escapeHtml(item.label)}</th>
      <td>${modeCell(item, entry)}</td>
      <td><input type="number" min="0" step="1" name="${fieldName(item.key, 'amount')}" value="${number(entry.amount)}" aria-label="${escapeHtml(item.label)} 금액"></td>
      <td class="number">${entered ? money(breakdown.perPerson) : '-'}${entered ? `<small>${escapeHtml(fixedCostBasisText(breakdown))}</small>` : ''}</td>
      <td class="number">${entered ? money(breakdown.studentTotal) : '-'}</td>
      <td><input type="text" name="${fieldName(item.key, 'memo')}" value="${escapeHtml(entry.memo)}" placeholder="예: 2박" aria-label="${escapeHtml(item.label)} 내용"></td>
    </tr>`;
}

/** 체험처/비용 화면의 기타비 입력 표. 1인당 금액과 합계는 저장한 인원 기준으로 보여 준다. */
export function renderFixedCostTable(project) {
  const fixedCosts = normalizeFixedCosts(project.fixedCosts);
  const c = projectCounts(project);
  const counts = { participants: c.participants, dayAbsent: c.contractedAbsent, chaperones: c.chaperones };
  const options = { dayAbsentSharesCommonCost: Boolean(project.dayAbsentSharesCommonCost) };
  const rows = FIXED_COST_ITEMS.map(item => fixedCostRow(item, fixedCosts[item.key], counts, options)).join('');

  return `
    <div class="fixed-cost-block" data-fixed-cost-section>
      <h3>기타비</h3>
      <p class="help">전체 계약액은 인원으로 나눠 1인당 금액을 만들고 10원 미만은 버립니다. '인솔자도 함께 부담'을 체크하면 학생 + 인솔자(${counts.chaperones}명) 수로 나눕니다. 금액은 저장하면 다시 계산됩니다.</p>
      <div class="table-wrap">
        <table class="compact-table fixed-cost-table">
          <thead><tr><th>항목</th><th>입력 방식</th><th>금액(원)</th><th>학생 1인당</th><th>학생 합계</th><th>내용</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/** 입력 방식을 바꾸면 '인솔자도 함께 부담'은 전체 계약액일 때만 고를 수 있게 한다. */
export function syncFixedCostModeControls(select) {
  const checkbox = select.closest('.fixed-cost-mode')?.querySelector('[data-fixed-cost-chaperones]');
  if (checkbox) checkbox.disabled = select.value !== 'total';
}

/** 폼에 기타비 입력칸이 있으면 값을 읽고, 없으면 기존 값을 그대로 돌려준다. */
export function readFixedCostInputs(data, previousFixedCosts) {
  if (!data.has(fieldName(FIXED_COST_ITEMS[0].key, 'amount'))) return normalizeFixedCosts(previousFixedCosts);
  const previous = normalizeFixedCosts(previousFixedCosts);
  return normalizeFixedCosts(Object.fromEntries(FIXED_COST_ITEMS.map(item => {
    const mode = data.get(fieldName(item.key, 'mode'));
    return [item.key, {
      mode,
      amount: data.get(fieldName(item.key, 'amount')),
      // 1인당 금액일 때는 체크박스가 비활성이라 값이 오지 않으므로 이전 선택을 유지한다.
      includeChaperones: mode === 'total' ? data.has(fieldName(item.key, 'includeChaperones')) : previous[item.key].includeChaperones,
      memo: String(data.get(fieldName(item.key, 'memo')) ?? '').trim()
    }];
  })));
}
