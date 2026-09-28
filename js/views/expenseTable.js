import { createExpense } from '../presets.js';
import { applyCostMethod, costInputAmount, costMethodOf, costMethodOptions } from '../costMethods.js';
import { escapeHtml, number } from '../utils.js';

/**
 * 체험처/비용 표(학생용·인솔자용 공통): 순서 | 일자 | 체험처/항목 | 계산방법 | 단가 | 삭제
 * 인솔자용 표는 학생용과 모양이 같아서 '학생용 작성 내용 붙여넣기'가 그대로 복사된다.
 */
const COLUMN_COUNT = 6;
const EMPTY_TEXT = '등록된 체험처/비용 항목이 없습니다.';

function methodSelect(kind, expense) {
  const selected = costMethodOf(kind, expense);
  const options = costMethodOptions(kind, expense)
    .map(({ value, label }) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`)
    .join('');
  return `<select data-field="costMethod" aria-label="계산방법">${options}</select>`;
}

export function expenseRowHtml(expense, kind = 'student') {
  return `
    <tr data-expense-row data-expense-kind="${kind}" data-expense-id="${escapeHtml(expense.id)}">
      <td class="center">
        <button type="button" class="small-button" data-action="move-expense-up">↑</button>
        <button type="button" class="small-button" data-action="move-expense-down">↓</button>
      </td>
      <td><input type="date" data-field="date" value="${escapeHtml(expense.date ?? '')}" aria-label="일자"></td>
      <td><input type="text" data-field="name" value="${escapeHtml(expense.name ?? '')}" aria-label="체험처/항목"></td>
      <td>${methodSelect(kind, expense)}</td>
      <td><input type="number" min="0" data-field="amount" value="${number(costInputAmount(kind, expense))}" aria-label="단가"></td>
      <td class="expense-actions"><button type="button" class="small-button danger" data-action="delete-expense">삭제</button></td>
    </tr>`;
}

function emptyRowHtml() {
  return `<tr data-empty-row><td colspan="${COLUMN_COUNT}" class="center">${EMPTY_TEXT}</td></tr>`;
}

export function renderExpenseRows(expenses, kind = 'student') {
  if (!expenses.length) return emptyRowHtml();
  return expenses.map(expense => expenseRowHtml(expense, kind)).join('');
}

function mainRows(tbody) {
  return [...tbody.querySelectorAll('[data-expense-row]')];
}

export function updateExpenseRowButtons(tbody) {
  if (!tbody) return;
  const rows = mainRows(tbody);
  rows.forEach((row, index) => {
    const up = row.querySelector('[data-action="move-expense-up"]');
    const down = row.querySelector('[data-action="move-expense-down"]');
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === rows.length - 1;
  });
}

export function addExpenseRow(tbody, defaultDate = '', kind = 'student') {
  tbody.querySelector('[data-empty-row]')?.remove();
  tbody.insertAdjacentHTML('beforeend', expenseRowHtml(createExpense({ date: defaultDate }), kind));
  updateExpenseRowButtons(tbody);
}

export function removeExpenseRow(tbody, id) {
  mainRows(tbody).find(row => row.dataset.expenseId === id)?.remove();
  if (!mainRows(tbody).length) tbody.innerHTML = emptyRowHtml();
  updateExpenseRowButtons(tbody);
}

export function moveExpenseRow(tbody, id, direction) {
  const rows = mainRows(tbody);
  const index = rows.findIndex(row => row.dataset.expenseId === id);
  const target = rows[direction === 'up' ? index - 1 : index + 1];
  if (index < 0 || !target) return;
  if (direction === 'up') target.before(rows[index]);
  else target.after(rows[index]);
  updateExpenseRowButtons(tbody);
}

/** 학생용 항목을 인솔자용으로 복사한다. 새 ID를 쓰고, 계산방법은 인솔자용 선택지에 맞춘다. */
export function cloneExpensesForStaff(expenses) {
  return expenses.map(expense => {
    const { id: _id, ...copy } = expense;
    const cloned = createExpense({ ...copy, details: { ...(expense.details ?? {}) } });
    const amount = costInputAmount('student', expense);
    return expense.calcMethod === 'perPerson' ? applyCostMethod('staff', cloned, 'perStaff', amount) : cloned;
  });
}

export function replaceExpenseRows(tbody, expenses, kind = 'student') {
  tbody.innerHTML = renderExpenseRows(expenses, kind);
  updateExpenseRowButtons(tbody);
}

export function readExpenseRows(tbody, previousExpenses = []) {
  const previousById = new Map(previousExpenses.map(expense => [expense.id, expense]));
  return mainRows(tbody).map(row => {
    const id = row.dataset.expenseId;
    const kind = row.dataset.expenseKind === 'staff' ? 'staff' : 'student';
    const field = name => row.querySelector(`[data-field="${name}"]`);
    const previous = { ...(previousById.get(id) ?? createExpense()), id };
    return applyCostMethod(kind, {
      ...previous,
      date: field('date').value,
      name: field('name').value.trim()
    }, field('costMethod').value, field('amount').value);
  });
}
