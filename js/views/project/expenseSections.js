import { renderExpenseRows } from '../expenseTable.js';

export function renderStudentExpenseSection(project) {
  return `
    <fieldset class="section-fieldset expense-section" data-expense-section="student" data-project-section="expenses">
      <legend>체험처/비용(학생용)</legend>
      <button type="button" class="section-save" data-action="save-student-expenses">저장</button>
      <div class="section-note expense-guide">
        <p>일정별 체험처와 금액 등을 입력해 주세요. 세부정보를 입력하면 안내자료 생성 기능에 사용할 수 있습니다.</p>
        <p>대상인원의 경우 참가 학생별 결제를 하는 곳(식당, 공연 등)은 1인당 금액으로 설정하세요.</p>
        <p>학생 전체가 통합 금액을 지불하는 곳(호텔, 유스호스텔 등)은 학생 총액으로 설정하세요.</p>
        <p>인솔자를 포함한 전체 인원이 금액을 지불하는 곳(버스비 등)은 학생+인솔자 총액으로 설정하세요.</p>
      </div>
      <div class="toolbar">
        <button type="button" data-action="add-expense" data-expense-kind="student">항목 추가</button>
        <span class="help">세부정보에는 도착 시간, 나가는 시간, 주소, 관계자 연락처를 저장할 수 있습니다.</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>순서</th><th>일자</th><th>체험처/항목</th><th>계산방법</th><th>대상인원</th><th>직접수량</th><th>단가/총액</th>
              <th>학생 계획액</th><th>공통비 중 인솔자 몫</th><th>실제 지출액</th><th>학생 정산액</th><th>관리</th>
            </tr>
          </thead>
          <tbody id="studentExpenseTableBody" data-expense-table="student">${renderExpenseRows(project.expenses, project, { kind: 'student' })}</tbody>
        </table>
      </div>
    </fieldset>`;
}

export function renderStaffExpenseSection(project) {
  const expenses = Array.isArray(project.staffExpenses) ? project.staffExpenses : [];
  return `
    <fieldset class="section-fieldset expense-section" data-expense-section="staff" data-project-section="expenses">
      <legend>체험처/비용(인솔자용)</legend>
      <button type="button" class="section-save" data-action="save-staff-expenses">저장</button>
      <p class="section-note">학생용 일정과 체험처를 복사한 뒤 인솔자에게 필요 없는 항목을 삭제하거나 금액을 수정할 수 있습니다.</p>
      <div class="toolbar">
        <button type="button" data-action="copy-student-expenses">학생용 작성 내용 붙여넣기</button>
        <button type="button" data-action="add-expense" data-expense-kind="staff">항목 추가</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>순서</th><th>일자</th><th>체험처/항목</th><th>계산방법</th><th>대상 기준</th><th>직접수량</th><th>단가/총액</th>
              <th>인솔자 계획액</th><th>실제 지출액</th><th>인솔자 정산액</th><th>관리</th>
            </tr>
          </thead>
          <tbody id="staffExpenseTableBody" data-expense-table="staff">${renderExpenseRows(expenses, project, { kind: 'staff' })}</tbody>
        </table>
      </div>
    </fieldset>`;
}

export function renderExpenseSections(project) {
  return `${renderStudentExpenseSection(project)}${renderStaffExpenseSection(project)}`;
}
