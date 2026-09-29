import { projectCounts } from '../../engine.js';
import {
  FIXED_COST_MODES,
  createCustomFixedCost,
  fixedCostBasisText,
  fixedCostBreakdown,
  fixedCostStaffShares,
  normalizeFixedCosts
} from '../../fixedCosts.js';
import { escapeHtml, formatWon, number } from '../../utils.js';

const money = value => formatWon(Math.round(number(value)));

function countsOf(project) {
  const c = projectCounts(project);
  return { participants: c.participants, dayAbsent: c.contractedAbsent, chaperones: c.chaperones };
}

function modeCell(entry) {
  const options = Object.entries(FIXED_COST_MODES)
    .map(([mode, label]) => `<option value="${mode}" ${mode === entry.mode ? 'selected' : ''}>${label}</option>`)
    .join('');
  const disabled = entry.mode === 'total' ? '' : 'disabled';
  return `
    <div class="fixed-cost-mode">
      <select data-fixed-field="mode" data-fixed-cost-mode aria-label="입력 방식">${options}</select>
      <label class="check-label" title="전체 계약액을 학생 + 인솔자 수로 나눕니다">
        <input type="checkbox" data-fixed-field="includeChaperones" data-total-only ${entry.includeChaperones ? 'checked' : ''} ${disabled}> 인솔자도 함께 부담
      </label>
      <label class="check-label" title="1인당 금액의 1원 단위를 버리고 10원 단위로 맞춥니다">
        <input type="checkbox" data-fixed-field="roundTo10" data-total-only ${entry.roundTo10 ? 'checked' : ''} ${disabled}> 1원 단위 버림
      </label>
      <label class="check-label" title="1·3학년이 버스를 같이 타는 경우처럼 다른 사업 인원까지 합친 전체 인원으로 나눌 때 입력합니다. 비워 두면 이 사업 인원으로 나눕니다.">
        계산 인원 <input type="number" min="0" step="1" class="headcount-input" data-fixed-field="headcount" data-total-only value="${entry.headcount ?? ''}" placeholder="자동" ${disabled} aria-label="계산 인원">명
      </label>
      <label class="check-label" title="신청 후 불참자도 이 비용을 부담합니다">
        <input type="checkbox" data-fixed-field="commonCost" ${entry.commonCost ? 'checked' : ''}> 공통비
      </label>
    </div>`;
}

export function fixedCostRowHtml(entry, breakdown = null) {
  const entered = breakdown && entry.amount > 0;
  const name = entry.builtin
    ? escapeHtml(entry.label)
    : `<input type="text" data-fixed-field="label" value="${escapeHtml(entry.label)}" placeholder="항목 이름" aria-label="기타비 항목 이름">`;
  return `
    <tr data-fixed-row data-fixed-id="${escapeHtml(entry.id)}" data-builtin="${entry.builtin ?? ''}">
      <th scope="row">${name}</th>
      <td>${modeCell(entry)}</td>
      <td><input type="number" min="0" step="1" data-fixed-field="amount" value="${number(entry.amount)}" aria-label="금액"></td>
      <td class="number">${entered ? money(breakdown.perPerson) : '-'}${entered ? `<small>${escapeHtml(fixedCostBasisText(breakdown))}</small>` : ''}</td>
      <td class="number">${entered ? money(breakdown.studentTotal) : '-'}</td>
      <td><input type="text" data-fixed-field="memo" value="${escapeHtml(entry.memo)}" placeholder="예: 2박" aria-label="내용"></td>
      <td class="center">${entry.builtin ? '' : '<button type="button" class="small-button danger" data-action="delete-fixed-cost">삭제</button>'}</td>
    </tr>`;
}

function staffShareRows(project) {
  return fixedCostStaffShares(project, countsOf(project))
    .filter(share => share.kind === 'remainder')
    .map(share => `
      <tr class="auto-row">
        <th scope="row">${escapeHtml(share.label)}</th>
        <td colspan="3">인솔자 비용</td>
        <td class="number">${money(share.total)}</td>
        <td colspan="2"></td>
      </tr>`).join('');
}

/** 체험처/비용 화면의 기타비 입력 표. 1인당 금액과 합계는 저장한 인원 기준으로 보여 준다. */
export function renderFixedCostTable(project) {
  const counts = countsOf(project);
  const options = { dayAbsentSharesCommonCost: Boolean(project.dayAbsentSharesCommonCost) };
  const rows = normalizeFixedCosts(project.fixedCosts)
    .map(entry => fixedCostRowHtml(entry, fixedCostBreakdown(entry, counts, options)))
    .join('');

  return `
    <div class="fixed-cost-block" data-fixed-cost-section>
      <div class="block-head">
        <h3>기타비</h3>
        <button type="button" class="small-button" data-action="add-fixed-cost">기타비 항목 추가</button>
        <span class="spacer"></span>
        <button type="button" class="save-button" data-action="save-student-expenses">저장</button>
      </div>
      <div class="table-wrap">
        <table class="compact-table fixed-cost-table">
          <thead><tr><th>항목</th><th>입력 방식</th><th>금액(원)</th><th>학생 1인당</th><th>학생 합계</th><th>내용</th><th>삭제</th></tr></thead>
          <tbody data-fixed-cost-list>${rows}${staffShareRows(project)}</tbody>
        </table>
      </div>
    </div>`;
}

export function addFixedCostRow(button) {
  const tbody = button.closest('[data-fixed-cost-section]')?.querySelector('[data-fixed-cost-list]');
  if (!tbody) return;
  const lastItem = [...tbody.querySelectorAll('[data-fixed-row]')].at(-1);
  lastItem.insertAdjacentHTML('afterend', fixedCostRowHtml(createCustomFixedCost()));
  lastItem.nextElementSibling?.querySelector('[data-fixed-field="label"]')?.focus();
}

export function removeFixedCostRow(button) {
  button.closest('[data-fixed-row]')?.remove();
}

/** 입력 방식을 바꾸면 전체 계약액 전용 체크박스를 켜고 끈다. */
export function syncFixedCostModeControls(select) {
  select.closest('.fixed-cost-mode')?.querySelectorAll('[data-total-only]').forEach(checkbox => {
    checkbox.disabled = select.value !== 'total';
  });
}

/** 폼에 기타비 표가 있으면 행을 읽고, 없으면 기존 값을 그대로 돌려준다. */
export function readFixedCostInputs(form, previousFixedCosts) {
  const tbody = form.querySelector('[data-fixed-cost-list]');
  const previous = normalizeFixedCosts(previousFixedCosts);
  if (!tbody) return previous;
  const previousById = new Map(previous.map(entry => [entry.id, entry]));
  return normalizeFixedCosts([...tbody.querySelectorAll('[data-fixed-row]')].map(row => {
    const field = name => row.querySelector(`[data-fixed-field="${name}"]`);
    const before = previousById.get(row.dataset.fixedId) ?? {};
    const mode = field('mode').value;
    return {
      ...before,
      id: row.dataset.fixedId,
      builtin: row.dataset.builtin || null,
      label: field('label')?.value.trim() ?? before.label,
      mode,
      amount: field('amount').value,
      // 1인당 금액일 때는 체크박스가 꺼져 있으므로 이전 선택을 유지한다.
      includeChaperones: mode === 'total' ? field('includeChaperones').checked : before.includeChaperones,
      roundTo10: mode === 'total' ? field('roundTo10').checked : before.roundTo10,
      commonCost: field('commonCost').checked,
      headcount: mode === 'total' ? field('headcount').value : before.headcount,
      memo: field('memo').value.trim()
    };
  }));
}
