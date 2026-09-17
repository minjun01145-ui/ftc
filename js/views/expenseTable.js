import { calculateExpense, calculateStaffExpense } from '../engine.js';
import { createExpense } from '../presets.js';
import { escapeHtml, formatWon, number } from '../utils.js';

function money(value) {
  return formatWon(Math.round(number(value)));
}

function option(value, selected, label) {
  return `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;
}

function methodOptions(selected, kind) {
  const fixedLabel = kind === 'staff' ? '인솔자 총액' : '학생 총액';
  return [
    option('perPerson', selected, '1인당 금액'),
    option('fixedStudent', selected, fixedLabel),
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

function detailsOf(expense) {
  return {
    arrivalTime: String(expense.details?.arrivalTime ?? ''),
    departureTime: String(expense.details?.departureTime ?? ''),
    address: String(expense.details?.address ?? ''),
    contact: String(expense.details?.contact ?? '')
  };
}

export function hasExpenseDetails(expense) {
  return Object.values(detailsOf(expense)).some(value => value.trim() !== '');
}

function detailEditorHtml(expense, colspan) {
  const details = detailsOf(expense);
  return `
    <tr class="expense-detail-editor" data-expense-detail-editor="${escapeHtml(expense.id)}" hidden>
      <td colspan="${colspan}">
        <div class="detail-editor-grid">
          <label>도착 시간 <input type="time" data-detail-field="arrivalTime" value="${escapeHtml(details.arrivalTime)}"></label>
          <label>나가는 시간 <input type="time" data-detail-field="departureTime" value="${escapeHtml(details.departureTime)}"></label>
          <label>주소 <input type="text" data-detail-field="address" value="${escapeHtml(details.address)}"></label>
          <label>관계자 연락처 <input type="text" data-detail-field="contact" value="${escapeHtml(details.contact)}"></label>
        </div>
        <div class="detail-editor-actions">
          <button type="button" class="small-button" data-action="close-detail-editor" data-expense-id="${escapeHtml(expense.id)}">입력창 닫기</button>
        </div>
      </td>
    </tr>`;
}

function detailViewHtml(expense, colspan) {
  const details = detailsOf(expense);
  return `
    <tr class="expense-detail-view" data-expense-detail-view="${escapeHtml(expense.id)}" hidden>
      <td colspan="${colspan}">
        <div class="detail-view-grid">
          <span><strong>도착 시간</strong> <span data-detail-value="arrivalTime">${escapeHtml(details.arrivalTime || '-')}</span></span>
          <span><strong>나가는 시간</strong> <span data-detail-value="departureTime">${escapeHtml(details.departureTime || '-')}</span></span>
          <span><strong>주소</strong> <span data-detail-value="address">${escapeHtml(details.address || '-')}</span></span>
          <span><strong>관계자 연락처</strong> <span data-detail-value="contact">${escapeHtml(details.contact || '-')}</span></span>
        </div>
      </td>
    </tr>`;
}

function studentRowHtml(expense, project, calculated) {
  const calc = calculated ? calculateExpense(expense, project, false) : null;
  const amount = expense.calcMethod === 'perPerson' ? expense.unitAmount : expense.planAmount;
  const customDisabled = expense.quantityBase !== 'custom' ? 'disabled' : '';
  const detailExists = hasExpenseDetails(expense);

  return `
    <tr data-expense-row data-expense-kind="student" data-expense-id="${escapeHtml(expense.id)}">
      <td class="center">
        <button type="button" class="small-button" data-action="move-expense-up">↑</button>
        <button type="button" class="small-button" data-action="move-expense-down">↓</button>
      </td>
      <td><input type="date" data-field="date" value="${escapeHtml(expense.date ?? '')}"></td>
      <td><input type="text" data-field="name" value="${escapeHtml(expense.name ?? '')}"></td>
      <td><select data-field="calcMethod">${methodOptions(expense.calcMethod, 'student')}</select></td>
      <td><select data-field="quantityBase">${quantityOptions(expense.quantityBase)}</select></td>
      <td><input type="number" min="0" data-field="customQuantity" value="${number(expense.customQuantity)}" ${customDisabled}></td>
      <td><input type="number" min="0" data-field="amount" value="${number(amount)}"></td>
      <td class="number">${calc ? money(calc.studentTotal) : '저장 후 계산'}</td>
      <td class="number">${calc ? money(calc.staffTotal) : '저장 후 계산'}</td>
      <td><input type="number" min="0" placeholder="계획과 같으면 비움" data-field="actualAmount" value="${expense.actualAmount ?? ''}"></td>
      <td class="number">${calc ? money(calculateExpense(expense, project, true).studentTotal) : '저장 후 계산'}</td>
      <td class="expense-actions">
        <button type="button" class="small-button" data-action="edit-expense-details">세부정보 입력</button>
        <button type="button" class="small-button" data-action="toggle-expense-details" ${detailExists ? '' : 'disabled'}>펼치기</button>
        <button type="button" class="small-button danger" data-action="delete-expense">삭제</button>
      </td>
    </tr>
    ${detailEditorHtml(expense, 12)}
    ${detailViewHtml(expense, 12)}`;
}

function staffRowHtml(expense, project, calculated) {
  const plan = calculated ? calculateStaffExpense(expense, project, false) : null;
  const settlement = calculated ? calculateStaffExpense(expense, project, true) : null;
  const amount = expense.calcMethod === 'perPerson' ? expense.unitAmount : expense.planAmount;
  const customDisabled = expense.quantityBase !== 'custom' ? 'disabled' : '';
  const detailExists = hasExpenseDetails(expense);

  return `
    <tr data-expense-row data-expense-kind="staff" data-expense-id="${escapeHtml(expense.id)}">
      <td class="center">
        <button type="button" class="small-button" data-action="move-expense-up">↑</button>
        <button type="button" class="small-button" data-action="move-expense-down">↓</button>
      </td>
      <td><input type="date" data-field="date" value="${escapeHtml(expense.date ?? '')}"></td>
      <td><input type="text" data-field="name" value="${escapeHtml(expense.name ?? '')}"></td>
      <td><select data-field="calcMethod">${methodOptions(expense.calcMethod, 'staff')}</select></td>
      <td><select data-field="quantityBase">${quantityOptions(expense.quantityBase)}</select></td>
      <td><input type="number" min="0" data-field="customQuantity" value="${number(expense.customQuantity)}" ${customDisabled}></td>
      <td><input type="number" min="0" data-field="amount" value="${number(amount)}"></td>
      <td class="number">${plan ? money(plan.total) : '저장 후 계산'}</td>
      <td><input type="number" min="0" placeholder="계획과 같으면 비움" data-field="actualAmount" value="${expense.actualAmount ?? ''}"></td>
      <td class="number">${settlement ? money(settlement.total) : '저장 후 계산'}</td>
      <td class="expense-actions">
        <button type="button" class="small-button" data-action="edit-expense-details">세부정보 입력</button>
        <button type="button" class="small-button" data-action="toggle-expense-details" ${detailExists ? '' : 'disabled'}>펼치기</button>
        <button type="button" class="small-button danger" data-action="delete-expense">삭제</button>
      </td>
    </tr>
    ${detailEditorHtml(expense, 11)}
    ${detailViewHtml(expense, 11)}`;
}

export function expenseRowHtml(expense, project, { calculated = true, kind = 'student' } = {}) {
  return kind === 'staff'
    ? staffRowHtml(expense, project, calculated)
    : studentRowHtml(expense, project, calculated);
}

export function renderExpenseRows(expenses, project, { kind = 'student' } = {}) {
  const colspan = kind === 'staff' ? 11 : 12;
  if (!expenses.length) {
    return `<tr data-empty-row><td colspan="${colspan}" class="center">등록된 체험처/비용 항목이 없습니다.</td></tr>`;
  }
  return expenses.map(expense => expenseRowHtml(expense, project, { kind })).join('');
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

function rowForId(tbody, id) {
  return mainRows(tbody).find(row => row.dataset.expenseId === id) ?? null;
}

function relatedRow(tbody, dataKey, id) {
  return [...tbody.querySelectorAll(`tr[${dataKey}]`)].find(row => row.getAttribute(dataKey) === id) ?? null;
}

function groupRows(tbody, id) {
  return [
    rowForId(tbody, id),
    relatedRow(tbody, 'data-expense-detail-editor', id),
    relatedRow(tbody, 'data-expense-detail-view', id)
  ].filter(Boolean);
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

export function removeExpenseGroup(tbody, id) {
  groupRows(tbody, id).forEach(row => row.remove());
  if (!mainRows(tbody).length) {
    const kind = tbody.dataset.expenseTable;
    const colspan = kind === 'staff' ? 11 : 12;
    tbody.innerHTML = `<tr data-empty-row><td colspan="${colspan}" class="center">등록된 체험처/비용 항목이 없습니다.</td></tr>`;
  }
  updateExpenseRowButtons(tbody);
}

export function moveExpenseGroup(tbody, id, direction) {
  const rows = mainRows(tbody);
  const index = rows.findIndex(row => row.dataset.expenseId === id);
  if (index < 0) return;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) return;

  const moving = groupRows(tbody, id);
  const target = groupRows(tbody, rows[targetIndex].dataset.expenseId);
  if (!moving.length || !target.length) return;

  if (direction === 'up') {
    const anchor = target[0];
    moving.forEach(node => tbody.insertBefore(node, anchor));
  } else {
    const anchor = target[target.length - 1].nextSibling;
    moving.forEach(node => tbody.insertBefore(node, anchor));
  }
  updateExpenseRowButtons(tbody);
}

export function toggleExpenseDetailEditor(tbody, id, forceClosed = false) {
  const editor = relatedRow(tbody, 'data-expense-detail-editor', id);
  if (!editor) return;
  editor.hidden = forceClosed ? true : !editor.hidden;
}

function currentDetailValues(tbody, id) {
  const editor = relatedRow(tbody, 'data-expense-detail-editor', id);
  if (!editor) return detailsOf({});
  const value = field => editor.querySelector(`[data-detail-field="${field}"]`)?.value ?? '';
  return {
    arrivalTime: value('arrivalTime'),
    departureTime: value('departureTime'),
    address: value('address').trim(),
    contact: value('contact').trim()
  };
}

export function syncExpenseDetailAvailability(tbody, id) {
  const main = rowForId(tbody, id);
  if (!main) return;
  const details = currentDetailValues(tbody, id);
  const exists = Object.values(details).some(value => value.trim() !== '');
  const toggle = main.querySelector('[data-action="toggle-expense-details"]');
  if (toggle) toggle.disabled = !exists;
  if (!exists) {
    const view = relatedRow(tbody, 'data-expense-detail-view', id);
    if (view) view.hidden = true;
    if (toggle) toggle.textContent = '펼치기';
  }
}

export function toggleExpenseDetailView(tbody, id) {
  const view = relatedRow(tbody, 'data-expense-detail-view', id);
  const main = rowForId(tbody, id);
  if (!view || !main) return;

  const details = currentDetailValues(tbody, id);
  const exists = Object.values(details).some(value => value.trim() !== '');
  const toggle = main.querySelector('[data-action="toggle-expense-details"]');
  if (!exists) {
    if (toggle) toggle.disabled = true;
    view.hidden = true;
    return;
  }

  for (const [field, value] of Object.entries(details)) {
    const target = view.querySelector(`[data-detail-value="${field}"]`);
    if (target) target.textContent = value || '-';
  }
  if (toggle) toggle.disabled = false;
  view.hidden = !view.hidden;
  if (toggle) toggle.textContent = view.hidden ? '펼치기' : '접기';
}

export function cloneExpensesForStaff(expenses) {
  return expenses.map(expense => {
    const { id: _id, ...copy } = expense;
    return createExpense({
      ...copy,
      details: { ...detailsOf(expense) }
    });
  });
}

export function replaceExpenseRows(tbody, expenses, project, kind = 'student', calculated = false) {
  tbody.innerHTML = renderExpenseRows(expenses, project, { kind, calculated });
  updateExpenseRowButtons(tbody);
}

export function readExpenseRows(tbody, previousExpenses = []) {
  const previousById = new Map(previousExpenses.map(expense => [expense.id, expense]));
  return mainRows(tbody).map(row => {
    const id = row.dataset.expenseId;
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
      actualAmount: actualValue === '' ? null : Math.max(0, number(actualValue)),
      details: currentDetailValues(tbody, id)
    };
  });
}
