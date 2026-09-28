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

export function renderStudentExpenseSection(project) {
  return `
    <fieldset class="section-fieldset expense-section" data-expense-section="student" data-project-section="expenses">
      <legend>체험처/비용(학생용)</legend>
      <button type="button" class="section-save" data-action="save-student-expenses">저장</button>
      ${renderFixedCostTable(project)}
      <h3>체험처</h3>
      <p class="help">1인당 금액은 실제 참여 학생 수 × 단가, 학생 총액은 당일 불참자까지 포함한 학생 수 × 단가로 계산합니다.</p>
      <div class="toolbar">
        <button type="button" data-action="add-expense" data-expense-kind="student">항목 추가</button>
      </div>
      ${expenseTable('studentExpenseTableBody', 'student', project.expenses ?? [])}
    </fieldset>`;
}

export function renderStaffExpenseSection(project) {
  return `
    <fieldset class="section-fieldset expense-section" data-expense-section="staff" data-project-section="expenses">
      <legend>체험처/비용(인솔자용)</legend>
      <button type="button" class="section-save" data-action="save-staff-expenses">저장</button>
      <p class="help">1인당 금액은 인솔자 수 × 단가, 총액은 입력한 금액 그대로 계산합니다.</p>
      <div class="toolbar">
        <button type="button" data-action="copy-student-expenses">학생용 작성 내용 붙여넣기</button>
        <button type="button" data-action="add-expense" data-expense-kind="staff">항목 추가</button>
      </div>
      ${expenseTable('staffExpenseTableBody', 'staff', project.staffExpenses ?? [])}
    </fieldset>`;
}

export function renderExpenseSections(project) {
  return `${renderStudentExpenseSection(project)}${renderStaffExpenseSection(project)}`;
}
