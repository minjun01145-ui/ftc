import { projectCounts } from '../../engine.js';
import {
  FIXED_COST_ITEMS,
  FIXED_COST_MODES,
  fixedCostAmounts,
  normalizeFixedCosts
} from '../../fixedCosts.js';
import { escapeHtml, formatWon, number } from '../../utils.js';

const money = value => formatWon(Math.round(number(value)));
const modeField = key => `fixedCost-${key}-mode`;
const amountField = key => `fixedCost-${key}-amount`;

function modeControl(item, entry) {
  if (item.modes.length === 1) {
    return `<span class="fixed-cost-mode">${FIXED_COST_MODES[item.modes[0]]}</span>
      <input type="hidden" name="${modeField(item.key)}" value="${item.modes[0]}">`;
  }
  const options = item.modes
    .map(mode => `<option value="${mode}" ${mode === entry.mode ? 'selected' : ''}>${FIXED_COST_MODES[mode]}</option>`)
    .join('');
  return `<select name="${modeField(item.key)}" aria-label="${escapeHtml(item.label)} 입력 방식">${options}</select>`;
}

/** 사업정보 화면의 고정비 입력칸 */
export function renderFixedCostInputSection(project) {
  const fixedCosts = normalizeFixedCosts(project.fixedCosts);
  const rows = FIXED_COST_ITEMS.map(item => {
    const entry = fixedCosts[item.key];
    return `
      <label for="${amountField(item.key)}">${escapeHtml(item.label)}</label>
      <div class="fixed-cost-input">
        ${modeControl(item, entry)}
        <input id="${amountField(item.key)}" name="${amountField(item.key)}" type="number" min="0" step="1" value="${number(entry.amount)}">
        <span>원</span>
      </div>`;
  }).join('');

  return `
    <fieldset class="section-fieldset" data-project-section="business" data-fixed-cost-section>
      <legend>고정비</legend>
      <button type="button" class="section-save" data-action="save-fixed-costs">저장</button>
      <div class="fixed-cost-grid">${rows}</div>
      <p class="help">전체 계약액은 실제 참여 학생 수로 나누어 1인당 금액을 계산합니다. 입력한 고정비는 체험처/비용에 자동으로 반영됩니다.</p>
    </fieldset>`;
}

/** 폼에 고정비 입력칸이 있으면 값을 읽고, 없으면 기존 값을 그대로 돌려준다. */
export function readFixedCostInputs(data, previousFixedCosts) {
  if (!data.has(amountField(FIXED_COST_ITEMS[0].key))) return normalizeFixedCosts(previousFixedCosts);
  return normalizeFixedCosts(Object.fromEntries(FIXED_COST_ITEMS.map(item => [item.key, {
    mode: data.get(modeField(item.key)),
    amount: data.get(amountField(item.key))
  }])));
}

/** 체험처/비용 화면의 고정비 요약(읽기 전용) */
export function renderFixedCostSummary(project) {
  const fixedCosts = normalizeFixedCosts(project.fixedCosts);
  const participants = projectCounts(project).participants;
  const rows = FIXED_COST_ITEMS.map(item => {
    const entry = fixedCosts[item.key];
    if (entry.amount <= 0) {
      return `<tr><td>${escapeHtml(item.label)}</td><td colspan="3" class="center help">미입력</td></tr>`;
    }
    const amounts = fixedCostAmounts(entry, participants);
    return `
      <tr>
        <td>${escapeHtml(item.label)}</td>
        <td>${FIXED_COST_MODES[entry.mode]} ${money(entry.amount)}</td>
        <td class="number">${participants > 0 ? money(amounts.perPerson) : '-'}</td>
        <td class="number">${money(amounts.total)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="fixed-cost-summary">
      <h3>고정비 <span class="help">사업정보에서 입력한 값입니다. 수정은 사업정보에서 해 주세요.</span></h3>
      <div class="table-wrap">
        <table class="compact-table">
          <thead><tr><th>항목</th><th>입력값</th><th>1인당(참여 ${participants}명 기준)</th><th>학생 합계</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
