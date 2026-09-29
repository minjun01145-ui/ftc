import { checkStudentExpenses } from '../../expenseChecks.js';
import { escapeHtml } from '../../utils.js';
import { renderExpenseRows } from '../expenseTable.js';
import { renderFixedCostTable } from './fixedCostSection.js';

const TABLE_HEAD = '<tr><th>순서</th><th>일자</th><th>체험처/항목</th><th>계산방법</th><th>단가</th><th>삭제</th></tr>';

function expenseTable(id, kind, expenses) {
  return `
    <div class="table-wrap">
      <table class="compact-table">
        <thead>${TABLE_HEAD}</thead>
        <tbody id="${id}" data-expense-table="${kind}">${renderExpenseRows(expenses, kind)}</tbody>
      </table>
    </div>`;
}

function expenseCheckList(project) {
  const issues = checkStudentExpenses(project);
  if (!issues.length) return '<p class="expense-checks ok-text">기초자료 점검: 확인할 항목이 없습니다.</p>';
  return `
    <div class="expense-checks">
      <strong>기초자료 점검</strong>
      <ul>${issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>
    </div>`;
}

export function renderStudentExpenseSection(project) {
  return `
    <fieldset class="section-fieldset expense-section" data-expense-section="student" data-project-section="expenses">
      <legend>체험처/비용(학생용)</legend>
      ${renderFixedCostTable(project)}
      <h3>체험처</h3>
      <div class="toolbar">
        <button type="button" data-action="add-expense" data-expense-kind="student">항목 추가</button>
        <span class="spacer"></span>
        <button type="button" class="save-button" data-action="save-student-expenses">저장</button>
      </div>
      ${expenseTable('studentExpenseTableBody', 'student', project.expenses ?? [])}
      ${expenseCheckList(project)}
    </fieldset>`;
}

export function renderStaffExpenseSection(project) {
  return `
    <fieldset class="section-fieldset expense-section" data-expense-section="staff" data-project-section="expenses">
      <legend>체험처/비용(인솔자용)</legend>
      <div class="toolbar">
        <button type="button" data-action="draft-staff-expenses">초안 자동 작성</button>
        <button type="button" data-action="add-expense" data-expense-kind="staff">항목 추가</button>
        <span class="spacer"></span>
        <button type="button" class="save-button" data-action="save-staff-expenses">저장</button>
      </div>
      ${expenseTable('staffExpenseTableBody', 'staff', project.staffExpenses ?? [])}
    </fieldset>`;
}

export function renderExpenseSections(project) {
  return `${renderStudentExpenseSection(project)}${renderStaffExpenseSection(project)}`;
}
