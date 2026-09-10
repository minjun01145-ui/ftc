import { calculateExpense } from '../engine.js';
import { createExpense } from '../presets.js';
import { escapeHtml, formatWon, number } from '../utils.js';

function money(value) {
  return formatWon(Math.round(number(value)));
}

function option(value, selected, label) {
  return `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;
}

function methodOptions(selected) {
  return [
    option('perPerson', selected, '1인당 금액'),
    option('fixedStudent', selected, '학생 총액'),
    option('sharedFixed', selected, '학생+인솔자 총액 분담')
  ].join('');
}

function quantityOptions(selected) {
  return [
    option('participants', selected, '실제 참가학생'),
    option('participantsPlusAbsent', selected, '참가학생+불참자'),
    option('totalStudents', selected, '총학생수'),
    option('custom', selected, '직접 입력')
  ].join('');
}

export function expenseRowHtml(expense, project, { calculated = true } = {}) {
  const calc = calculated ? calculateExpense(expense, project, false) : null;
  const amount = expense.calcMethod === 'perPerson' ? expense.unitAmount : expense.planAmount;
  const customDisabled = expense.quantityBase !== 'custom' ? 'disabled' : '';

  return `
    <tr data-expense-row data-id="${escapeHtml(expense.id)}">
      <td class="center">
        <button type="button" class="small-button" data-action="move-expense-up">↑</button>
        <button type="button" class="small-button" data-action="move-expense-down">↓</button>
      </td>
      <td><input type="date" data-field="date" value="${escapeHtml(expense.date ?? '')}"></td>
      <td><input type="text" data-field="name" value="${escapeHtml(expense.name ?? '')}"></td>
      <td><select data-field="calcMethod">${methodOptions(expense.calcMethod)}</select></td>
      <td><select data-field="quantityBase">${quantityOptions(expense.quantityBase)}</select></td>
      <td><input type="number" min="0" data-field="customQuantity" value="${number(expense.customQuantity)}" ${customDisabled}></td>
      <td><input type="number" min="0" data-field="amount" value="${number(amount)}"></td>
      <td class="number">${calc ? money(calc.studentTotal) : '저장 후 계산'}</td>
      <td class="number">${calc ? money(calc.staffTotal) : '저장 후 계산'}</td>
      <td><input type="number" min="0" placeholder="계획과 같으면 비움" data-field="actualAmount" value="${expense.actualAmount ?? ''}"></td>
      <td class="number">${calc ? money(calculateExpense(expense, project, true).studentTotal) : '저장 후 계산'}</td>
      <td class="center"><button type="button" class="small-button danger" data-action="delete-expense">삭제</button></td>
    </tr>`;
}

export function renderExpenseRows(project) {
  if (!project.expenses.length) {
    return '<tr data-empty-row><td colspan="12" class="center">등록된 체험처/비용 항목이 없습니다.</td></tr>';
  }
  return project.expenses.map(expense => expenseRowHtml(expense, project)).join('');
}

export function addExpenseRow(tbody, project, defaultDate = '') {
  tbody.querySelector('[data-empty-row]')?.remove();
  const expense = createExpense({ date: defaultDate || project.startDate || '' });
  tbody.insertAdjacentHTML('beforeend', expenseRowHtml(expense, project, { calculated: false }));
  updateExpenseRowButtons(tbody);
}

export function updateExpenseRowButtons(tbody) {
  const rows = [...tbody.querySelectorAll('[data-expense-row]')];
  rows.forEach((row, index) => {
    const up = row.querySelector('[data-action="move-expense-up"]');
    const down = row.querySelector('[data-action="move-expense-down"]');
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === rows.length - 1;
  });
}

export function toggleCustomQuantity(row) {
  const select = row.querySelector('[data-field="quantityBase"]');
  const input = row.querySelector('[data-field="customQuantity"]');
  if (!select || !input) return;
  input.disabled = select.value !== 'custom';
}

export function readExpenseRows(tbody, previousExpenses = []) {
  const previousById = new Map(previousExpenses.map(expense => [expense.id, expense]));
  return [...tbody.querySelectorAll('[data-expense-row]')].map(row => {
    const id = row.dataset.id;
    const previous = previousById.get(id) ?? createExpense({ id });
    const field = name => row.querySelector(`[data-field="${name}"]`);
    const calcMethod = field('calcMethod').value;
    const amount = Math.max(0, number(field('amount').value));
    const actualValue = field('actualAmount').value;

    return {
      ...previous,
      id,
      date: field('date').value,
      name: field('name').value.trim(),
      calcMethod,
      quantityBase: field('quantityBase').value,
      customQuantity: Math.max(0, number(field('customQuantity').value)),
      unitAmount: calcMethod === 'perPerson' ? amount : 0,
      planAmount: calcMethod === 'perPerson' ? 0 : amount,
      actualAmount: actualValue === '' ? null : Math.max(0, number(actualValue))
    };
  });
}
