import { calculateStaffExpense } from '../engine.js';
import { createExpense } from '../presets.js';
import {
  LEGACY_TOTAL_METHOD,
  STUDENT_COST_METHODS,
  applyStudentCostMethod,
  studentCostInputAmount,
  studentCostMethodOf
} from '../studentCostMethod.js';
import { escapeHtml, formatWon, number } from '../utils.js';

const COLUMN_COUNT = Object.freeze({ student: 5, staff: 11 });
const EMPTY_TEXT = '등록된 체험처/비용 항목이 없습니다.';

function money(value) {
  return formatWon(Math.round(number(value)));
}

function option(value, selected, label) {
  return `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;
}

function studentMethodOptions(expense) {
  const selected = studentCostMethodOf(expense);
  const methods = selected === LEGACY_TOTAL_METHOD.value
    ? [...STUDENT_COST_METHODS, LEGACY_TOTAL_METHOD]
    : STUDENT_COST_METHODS;
  return methods.map(method => option(method.value, selected, method.label)).join('');
}

function staffMethodOptions(selected) {
  return [
    option('perPerson', selected, '1인당 금액'),
    option('fixedStudent', selected, '인솔자 총액'),
    option('sharedFixed', selected, '학생+인솔자 총액 분담')
  ].join('');
}

function staffQuantityOptions(selected) {
  return [
    option('participants', selected, '실제 참가학생'),
    option('participantsPlusAbsent', selected, '참가학생+불참자'),
    option('totalStudents', selected, '총학생수'),
    option('custom', selected, '직접 입력')
  ].join('');
}

function orderCell() {
  return `
      <td class="center">
        <button type="button" class="small-button" data-action="move-expense-up">↑</button>
        <button type="button" class="small-button" data-action="move-expense-down">↓</button>
      </td>`;
}

function deleteCell() {
  return '<td class="expense-actions"><button type="button" class="small-button danger" data-action="delete-expense">삭제</button></td>';
}

function studentRowHtml(expense) {
  return `
    <tr data-expense-row data-expense-kind="student" data-expense-id="${escapeHtml(expense.id)}">
      ${orderCell()}
      <td><input type="date" data-field="date" value="${escapeHtml(expense.date ?? '')}"></td>
      <td><input type="text" data-field="name" value="${escapeHtml(expense.name ?? '')}"></td>
      <td><select data-field="costMethod">${studentMethodOptions(expense)}</select></td>
      <td><input type="number" min="0" data-field="amount" value="${number(studentCostInputAmount(expense))}"></td>
      ${deleteCell()}
    </tr>`;
}

function staffRowHtml(expense, project, calculated) {
  const plan = calculated ? calculateStaffExpense(expense, project, false) : null;
  const settlement = calculated ? calculateStaffExpense(expense, project, true) : null;
  const amount = expense.calcMethod === 'perPerson' ? expense.unitAmount : expense.planAmount;
  const customDisabled = expense.quantityBase !== 'custom' ? 'disabled' : '';

  return `
    <tr data-expense-row data-expense-kind="staff" data-expense-id="${escapeHtml(expense.id)}">
      ${orderCell()}
      <td><input type="date" data-field="date" value="${escapeHtml(expense.date ?? '')}"></td>
      <td><input type="text" data-field="name" value="${escapeHtml(expense.name ?? '')}"></td>
      <td><select data-field="calcMethod">${staffMethodOptions(expense.calcMethod)}</select></td>
      <td><select data-field="quantityBase">${staffQuantityOptions(expense.quantityBase)}</select></td>
      <td><input type="number" min="0" data-field="customQuantity" value="${number(expense.customQuantity)}" ${customDisabled}></td>
      <td><input type="number" min="0" data-field="amount" value="${number(amount)}"></td>
      <td class="number">${plan ? money(plan.total) : '저장 후 계산'}</td>
      <td><input type="number" min="0" placeholder="계획과 같으면 비움" data-field="actualAmount" value="${expense.actualAmount ?? ''}"></td>
      <td class="number">${settlement ? money(settlement.total) : '저장 후 계산'}</td>
      ${deleteCell()}
    </tr>`;
}

function emptyRowHtml(kind) {
  return `<tr data-empty-row><td colspan="${COLUMN_COUNT[kind] ?? COLUMN_COUNT.student}" class="center">${EMPTY_TEXT}</td></tr>`;
}

export function expenseRowHtml(expense, project, { calculated = true, kind = 'student' } = {}) {
  return kind === 'staff'
    ? staffRowHtml(expense, project, calculated)
    : studentRowHtml(expense);
}

export function renderExpenseRows(expenses, project, { kind = 'student', calculated = true } = {}) {
  if (!expenses.length) return emptyRowHtml(kind);
  return expenses.map(expense => expenseRowHtml(expense, project, { kind, calculated })).join('');
}

export function addExpenseRow(tbody, project, defaultDate = '', kind = 'student') {
  tbody.querySelector('[data-empty-row]')?.remove();
  const expense = createExpense({ date: defaultDate || project.startDate || '' });
  tbody.insertAdjacentHTML('beforeend', expenseRowHtml(expense, project, { calculated: false, kind }));
  updateExpenseRowButtons(tbody);
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

export function toggleCustomQuantity(row) {
  const select = row?.querySelector('[data-field="quantityBase"]');
  const input = row?.querySelector('[data-field="customQuantity"]');
  if (!select || !input) return;
  input.disabled = select.value !== 'custom';
}

export function removeExpenseRow(tbody, id) {
  mainRows(tbody).find(row => row.dataset.expenseId === id)?.remove();
  if (!mainRows(tbody).length) tbody.innerHTML = emptyRowHtml(tbody.dataset.expenseTable);
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

export function cloneExpensesForStaff(expenses) {
  return expenses.map(expense => {
    const { id: _id, ...copy } = expense;
    return createExpense({ ...copy, details: { ...(expense.details ?? {}) } });
  });
}

export function replaceExpenseRows(tbody, expenses, project, kind = 'student', calculated = false) {
  tbody.innerHTML = renderExpenseRows(expenses, project, { kind, calculated });
  updateExpenseRowButtons(tbody);
}

function readStudentRow(row, previous) {
  const field = name => row.querySelector(`[data-field="${name}"]`);
  return applyStudentCostMethod({
    ...previous,
    date: field('date').value,
    name: field('name').value.trim()
  }, field('costMethod').value, field('amount').value);
}

function readStaffRow(row, previous) {
  const field = name => row.querySelector(`[data-field="${name}"]`);
  const calcMethod = field('calcMethod').value;
  const amount = Math.max(0, number(field('amount').value));
  const actualValue = field('actualAmount').value;
  return {
    ...previous,
    date: field('date').value,
    name: field('name').value.trim(),
    calcMethod,
    quantityBase: field('quantityBase').value,
    customQuantity: Math.max(0, number(field('customQuantity').value)),
    unitAmount: calcMethod === 'perPerson' ? amount : 0,
    planAmount: calcMethod === 'perPerson' ? 0 : amount,
    actualAmount: actualValue === '' ? null : Math.max(0, number(actualValue))
  };
}

export function readExpenseRows(tbody, previousExpenses = []) {
  const previousById = new Map(previousExpenses.map(expense => [expense.id, expense]));
  return mainRows(tbody).map(row => {
    const id = row.dataset.expenseId;
    const previous = { ...(previousById.get(id) ?? createExpense()), id };
    return row.dataset.expenseKind === 'staff' ? readStaffRow(row, previous) : readStudentRow(row, previous);
  });
}
