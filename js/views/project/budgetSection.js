import { OTHER_SUPPORT_MODES, createOtherSupport, normalizeEducationMemos, otherSupportPerPerson } from '../../budget.js';
import { studentCostLines, sumLines } from '../../costLines.js';
import { projectCounts } from '../../engine.js';
import { escapeHtml, formatWon, number } from '../../utils.js';

const money = value => formatWon(Math.round(number(value)));
const EMPTY_OTHER_SUPPORTS = '<tr data-other-support-empty><td colspan="7" class="center">추가한 지원금이 없습니다.</td></tr>';

function memoInput(name, value, label) {
  return `<input type="text" class="budget-memo" name="${name}" value="${escapeHtml(value)}" placeholder="메모" aria-label="${label} 메모">`;
}

function educationRows(project) {
  const education = project.educationSupport ?? {};
  const memos = normalizeEducationMemos(education.memos);
  const fullSupport = education.vulnerableMode !== 'perPerson';
  const automaticVulnerable = sumLines(studentCostLines(project), 'perPerson');
  const manualVulnerable = Math.max(0, number(education.vulnerablePerPerson));

  return `
    <div class="budget-row">
      <label for="regularPerPerson">비취약계층 1인당</label>
      <div class="budget-amount"><input id="regularPerPerson" name="regularPerPerson" type="number" min="0" value="${number(education.regularPerPerson)}"><span>원</span></div>
      ${memoInput('educationMemo-regular', memos.regular, '비취약계층 1인당')}
    </div>
    <div class="budget-row">
      <label for="vulnerablePerPerson">취약계층 1인당</label>
      <div class="budget-amount">
        <input id="vulnerablePerPerson" name="vulnerablePerPerson" type="number" min="0"
          value="${fullSupport ? automaticVulnerable : manualVulnerable}"
          data-auto-value="${automaticVulnerable}" data-manual-value="${manualVulnerable}" ${fullSupport ? 'readonly' : ''}>
        <span>원</span>
        <label class="check-label"><input type="checkbox" name="vulnerableFullSupport" ${fullSupport ? 'checked' : ''}> 실비 전액</label>
      </div>
      ${memoInput('educationMemo-vulnerable', memos.vulnerable, '취약계층 1인당')}
    </div>
    <div class="budget-row">
      <label for="grantTotal">교육청 지원금 교부액<small>(잔액 정산용)</small></label>
      <div class="budget-amount"><input id="grantTotal" name="grantTotal" type="number" min="0" placeholder="미입력" value="${education.grantTotal ?? ''}"><span>원</span></div>
      ${memoInput('educationMemo-grant', memos.grant, '교육청 지원금 교부액')}
    </div>`;
}

export function otherSupportRowHtml(support, regularParticipants) {
  const modes = Object.entries(OTHER_SUPPORT_MODES)
    .map(([value, label]) => `<option value="${value}" ${value === support.mode ? 'selected' : ''}>${label}</option>`).join('');
  const perPerson = otherSupportPerPerson(support, regularParticipants);
  return `
    <tr data-other-support-row data-support-id="${escapeHtml(support.id)}">
      <td class="center">
        <button type="button" class="small-button" data-action="move-other-support-up">↑</button>
        <button type="button" class="small-button" data-action="move-other-support-down">↓</button>
      </td>
      <td><input type="text" data-support-field="name" value="${escapeHtml(support.name)}" placeholder="예: 학교 자체지원금" aria-label="지원금 이름"></td>
      <td><select data-support-field="mode" aria-label="지원 방식">${modes}</select></td>
      <td><input type="number" min="0" data-support-field="amount" value="${number(support.amount)}" aria-label="금액"></td>
      <td class="number">${support.amount > 0 ? money(perPerson) : '-'}</td>
      <td><input type="text" class="budget-memo" data-support-field="memo" value="${escapeHtml(support.memo)}" placeholder="메모" aria-label="지원금 메모"></td>
      <td class="center"><button type="button" class="small-button danger" data-action="delete-other-support">삭제</button></td>
    </tr>`;
}

export function renderBudgetSection(project) {
  const regularParticipants = projectCounts(project).regularParticipants;
  const supports = project.otherSupports ?? [];
  const supportRows = supports.length
    ? supports.map(support => otherSupportRowHtml(support, regularParticipants)).join('')
    : EMPTY_OTHER_SUPPORTS;

  return `
    <fieldset class="section-fieldset" data-project-section="budget" data-budget-section>
      <legend>예산</legend>
      <button type="button" class="section-save" data-action="save-budget">저장</button>

      <section class="budget-group">
        <h3>교육청 지원금</h3>
        <div class="budget-rows">${educationRows(project)}</div>
      </section>

      <section class="budget-group">
        <div class="budget-group-head">
          <h3>기타 지원금</h3>
          <button type="button" data-action="add-other-support">지원금 추가</button>
        </div>
        <p class="help">학교 자체지원금, 문화예술체험활동비, 지자체 지원금 등을 추가합니다. 비취약계층 참여 학생 ${regularParticipants}명 기준이며, 총액은 인원으로 나눠 1인당 금액을 계산합니다. 어떤 항목에 쓸지는 품의 도우미에서 정합니다.</p>
        <div class="table-wrap">
          <table class="compact-table other-support-table">
            <thead><tr><th>순서</th><th>지원금 이름</th><th>방식</th><th>금액(원)</th><th>1인당</th><th>메모</th><th>삭제</th></tr></thead>
            <tbody data-other-support-list>${supportRows}</tbody>
          </table>
        </div>
      </section>
    </fieldset>`;
}

function supportRows(tbody) {
  return [...tbody.querySelectorAll('[data-other-support-row]')];
}

export function addOtherSupportRow(section) {
  const tbody = section?.querySelector('[data-other-support-list]');
  if (!tbody) return;
  tbody.querySelector('[data-other-support-empty]')?.remove();
  tbody.insertAdjacentHTML('beforeend', otherSupportRowHtml(createOtherSupport(), 0));
  supportRows(tbody).at(-1)?.querySelector('[data-support-field="name"]')?.focus();
}

export function removeOtherSupportRow(button) {
  const tbody = button.closest('[data-other-support-list]');
  button.closest('[data-other-support-row]')?.remove();
  if (tbody && !supportRows(tbody).length) tbody.innerHTML = EMPTY_OTHER_SUPPORTS;
}

export function moveOtherSupportRow(button, direction) {
  const row = button.closest('[data-other-support-row]');
  const target = direction === 'up' ? row?.previousElementSibling : row?.nextElementSibling;
  if (!row || !target?.matches('[data-other-support-row]')) return;
  if (direction === 'up') target.before(row);
  else target.after(row);
}

/** 폼에 예산 입력칸이 없으면 null을 돌려준다. */
export function readBudgetInputs(form, data, previous) {
  if (!data.has('regularPerPerson')) return null;
  const fullSupport = data.has('vulnerableFullSupport');
  const grantText = String(data.get('grantTotal') ?? '').trim();
  const educationSupport = {
    ...previous.educationSupport,
    regularPerPerson: Math.max(0, number(data.get('regularPerPerson'))),
    vulnerableMode: fullSupport ? 'full' : 'perPerson',
    vulnerablePerPerson: fullSupport
      ? Math.max(0, number(previous.educationSupport?.vulnerablePerPerson))
      : Math.max(0, number(data.get('vulnerablePerPerson'))),
    grantTotal: grantText === '' ? null : Math.max(0, number(grantText)),
    memos: normalizeEducationMemos({
      regular: String(data.get('educationMemo-regular') ?? '').trim(),
      vulnerable: String(data.get('educationMemo-vulnerable') ?? '').trim(),
      grant: String(data.get('educationMemo-grant') ?? '').trim()
    })
  };

  const tbody = form.querySelector('[data-other-support-list]');
  const otherSupports = tbody ? supportRows(tbody).map(row => {
    const field = name => row.querySelector(`[data-support-field="${name}"]`);
    return createOtherSupport({
      id: row.dataset.supportId,
      name: field('name').value.trim(),
      mode: field('mode').value,
      amount: Math.max(0, Math.round(number(field('amount').value))),
      memo: field('memo').value.trim()
    });
  }) : previous.otherSupports;

  return { educationSupport, otherSupports };
}
