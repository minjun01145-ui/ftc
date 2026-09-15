import { allocateFunding, calculateExpenses, projectCounts, validateProject } from '../engine.js';
import { escapeHtml, formatWon, number } from '../utils.js';
import { readExpenseRows, renderExpenseRows } from './expenseTable.js';

function money(value) {
  return formatWon(Math.round(number(value)));
}

function vulnerableStudentTotal(project) {
  if (project.vulnerableStudents !== undefined && project.vulnerableStudents !== null) {
    return Math.max(0, number(project.vulnerableStudents));
  }
  return Math.max(0, number(project.vulnerableParticipants) + number(project.vulnerableAbsent));
}

function vulnerableFullPerPerson(project) {
  const counts = projectCounts(project);
  if (counts.vulnerableParticipants <= 0) return 0;

  const expenses = calculateExpenses(project, true);
  const participantCost = expenses.rows.reduce((sum, row) => sum + row.cohortCosts.vulnerable, 0);
  return participantCost / counts.vulnerableParticipants;
}

function renderAllocationTable(project, settlement) {
  const allocation = allocateFunding(project, settlement);
  const rows = allocation.allocations.map(row => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td class="number">${money(row.studentTotal)}</td>
      <td class="number">${money(row.education)}</td>
      <td class="number">${money(row.school)}</td>
      <td class="number">${money(row.student)}</td>
    </tr>`).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>항목</th><th>학생경비</th><th>교육청 지원금</th><th>학교 자체지원금</th><th>학생부담금</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="center">비용 항목이 없습니다.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function renderSummaryTable(project, settlement) {
  const allocation = allocateFunding(project, settlement);
  const label = settlement ? '정산' : '계획';
  return `
    <div class="table-wrap">
      <table class="summary-table">
        <tbody>
          <tr><th>${label} 학생경비 합계</th><td>${money(allocation.expenses.studentTotal)}</td></tr>
          <tr><th>${label} 공통비 중 인솔자 몫</th><td>${money(allocation.expenses.staffTotal)}</td></tr>
          <tr class="total"><th>${label} 공통비 포함 전체 비용</th><td>${money(allocation.expenses.total)}</td></tr>
          <tr><th>교육청 지원금 사용액</th><td>${money(allocation.educationUsed)}</td></tr>
          <tr><th>교육청 지원금 잔액</th><td>${allocation.educationBalance === null ? '교부액 미입력' : money(allocation.educationBalance)}</td></tr>
          <tr><th>학교 자체지원금 사용액</th><td>${money(allocation.schoolUsed)}</td></tr>
          <tr><th>학교 자체지원금 잔액</th><td>${money(allocation.schoolBalance)}</td></tr>
          <tr><th>학생부담금 합계</th><td>${money(allocation.studentUsed)}</td></tr>
          <tr class="total"><th>비취약 참가학생 1인당 부담액</th><td>${money(allocation.regularPersonalBurden)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

function renderValidation(project) {
  const validation = validateProject(project, false);
  if (!validation.issues.length) {
    return '<div class="status-box"><span class="ok-text">입력값 검증: 이상 없음</span></div>';
  }
  return `<div class="status-box"><span class="error-text">확인할 항목이 있습니다.</span><ul>${validation.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul></div>`;
}

function renderHeadcountReport(project) {
  const counts = projectCounts(project);
  const vulnerableTotal = vulnerableStudentTotal(project);
  const totalParticipants = counts.participants + counts.chaperones;

  return `
    <div class="report-text" aria-live="polite">
      <p>총학생수 ${counts.total}명 중 학생 불참자는 ${counts.absent}명으로 실제 참가학생 수는 ${counts.participants}명입니다. 인솔자 수는 ${counts.chaperones}명입니다. 총 참가자 수(인솔자 포함)는 ${totalParticipants}명입니다.</p>
      <p>취약계층은 ${vulnerableTotal}명이며 그 중 불참자는 ${counts.vulnerableAbsent}명입니다.</p>
    </div>`;
}

function renderHeadcountSection(project) {
  const counts = projectCounts(project);
  const vulnerableTotal = vulnerableStudentTotal(project);

  return `
    <fieldset class="section-fieldset">
      <legend>인원</legend>
      <button type="button" class="section-save" data-action="save-headcount">저장</button>
      <p class="section-note">회색 칸은 자동 계산으로, 저장버튼을 누르면 자동으로 계산됩니다.</p>
      <div class="form-grid">
        <label for="totalStudents">총학생수</label>
        <input id="totalStudents" name="totalStudents" type="number" min="0" value="${number(project.totalStudents)}">
        <label for="absentStudents">불참자수</label>
        <input id="absentStudents" name="absentStudents" type="number" min="0" value="${number(project.absentStudents)}">

        <label for="actualParticipants">실제 참가학생수</label>
        <input id="actualParticipants" name="actualParticipants" type="number" value="${counts.participants}" readonly>
        <span></span><span></span>

        <label for="vulnerableStudents">취약계층 학생수</label>
        <input id="vulnerableStudents" name="vulnerableStudents" type="number" min="0" value="${vulnerableTotal}">
        <label for="vulnerableAbsent">취약계층 중 불참자수</label>
        <input id="vulnerableAbsent" name="vulnerableAbsent" type="number" min="0" value="${number(project.vulnerableAbsent)}">

        <label for="chaperones">인솔자수</label>
        <input id="chaperones" name="chaperones" type="number" min="0" value="${number(project.chaperones)}">
      </div>
      ${renderHeadcountReport(project)}
    </fieldset>`;
}

function renderStudentExpenseSection(project) {
  return `
    <fieldset class="section-fieldset expense-section" data-expense-section="student">
      <legend>체험처/비용(학생용)</legend>
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

function renderStaffExpenseSection(project) {
  const expenses = Array.isArray(project.staffExpenses) ? project.staffExpenses : [];
  return `
    <fieldset class="section-fieldset expense-section" data-expense-section="staff">
      <legend>체험처/비용(인솔자용)</legend>
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

function renderBudgetSection(project) {
  const fullSupport = project.educationSupport.vulnerableMode === 'full';
  const automaticVulnerableAmount = Math.round(vulnerableFullPerPerson(project));
  const manualVulnerableAmount = Math.max(0, number(project.educationSupport.vulnerablePerPerson));
  const displayedVulnerableAmount = fullSupport ? automaticVulnerableAmount : manualVulnerableAmount;
  const studentBurden = Math.round(allocateFunding(project, true).regularPersonalBurden);

  return `
    <fieldset class="section-fieldset">
      <legend>예산</legend>
      <button type="button" class="section-save" data-action="save-budget">저장</button>
      <p class="section-note">교육청 지원금, 학교 자체 지원금을 입력해 주세요. 수익자 부담금은 체험처와 비용 등을 입력한 후 자동 계산됩니다.</p>
      <div class="form-grid">
        <label for="regularPerPerson">교육청 지원금(비취약계층 1인당)</label>
        <input id="regularPerPerson" name="regularPerPerson" type="number" min="0" value="${number(project.educationSupport.regularPerPerson)}">

        <label for="vulnerablePerPerson">교육청 지원금(취약계층 1인당)</label>
        <div class="input-with-option">
          <input id="vulnerablePerPerson" name="vulnerablePerPerson" type="number" min="0"
            value="${displayedVulnerableAmount}"
            data-auto-value="${automaticVulnerableAmount}"
            data-manual-value="${manualVulnerableAmount}"
            ${fullSupport ? 'readonly' : ''}>
          <label class="check-label"><input type="checkbox" name="vulnerableFullSupport" ${fullSupport ? 'checked' : ''}> 실비 전액</label>
        </div>

        <label for="schoolSupportAmount">학교 자체 지원금</label>
        <input id="schoolSupportAmount" name="schoolSupportAmount" type="number" min="0" value="${number(project.schoolSupport.amount)}">

        <label for="studentBurden">수익자 부담금</label>
        <input id="studentBurden" type="number" value="${studentBurden}" readonly>
      </div>
    </fieldset>`;
}

export function renderProjectPage(project, school) {
  return `
    <h1>${escapeHtml(project.title)}</h1>
    <form id="projectForm" data-project-id="${escapeHtml(project.id)}">
      <fieldset>
        <legend>사업정보</legend>
        <div class="form-grid">
          <label for="projectTitle">사업명</label>
          <input id="projectTitle" name="title" type="text" value="${escapeHtml(project.title)}">
          <label>학교명</label>
          <input readonly value="${escapeHtml(school.name)}">

          <label for="startDate">시작일</label>
          <input id="startDate" name="startDate" type="date" value="${escapeHtml(project.startDate)}">
          <label for="endDate">종료일</label>
          <input id="endDate" name="endDate" type="date" value="${escapeHtml(project.endDate)}">
        </div>
      </fieldset>

      ${renderHeadcountSection(project)}
      ${renderStudentExpenseSection(project)}
      ${renderStaffExpenseSection(project)}
      ${renderBudgetSection(project)}
      ${renderValidation(project)}

      <h2>계획 계산</h2>
      ${renderSummaryTable(project, false)}
      <h2>계획 재원 배분</h2>
      ${renderAllocationTable(project, false)}

      <h2>정산</h2>
      <p class="help">학생용 비용표의 ‘실제 지출액’을 입력하고 저장하면 정산 금액이 갱신됩니다. 비워두면 계획 금액을 사용합니다.</p>
      ${renderSummaryTable(project, true)}
      <h2>정산 재원 배분</h2>
      ${renderAllocationTable(project, true)}

      <fieldset>
        <legend>메모</legend>
        <textarea name="memo">${escapeHtml(project.memo)}</textarea>
      </fieldset>

      <div class="page-actions">
        <button type="submit">전체 저장</button>
        <button type="button" data-action="print">인쇄</button>
        <button type="button" class="danger" data-action="delete-project">이 사업 삭제</button>
      </div>
    </form>
  `;
}

export function readProjectForm(form, previous) {
  const data = new FormData(form);
  const studentTbody = form.querySelector('#studentExpenseTableBody');
  const staffTbody = form.querySelector('#staffExpenseTableBody');

  const totalStudents = Math.max(0, number(data.get('totalStudents')));
  const absentStudents = Math.max(0, number(data.get('absentStudents')));
  const actualParticipants = Math.max(0, totalStudents - absentStudents);
  const vulnerableStudents = Math.max(0, number(data.get('vulnerableStudents')));
  const vulnerableAbsent = Math.max(0, number(data.get('vulnerableAbsent')));
  const vulnerableParticipants = Math.max(0, vulnerableStudents - vulnerableAbsent);
  const vulnerableMode = data.get('vulnerableFullSupport') === 'on' ? 'full' : 'perPerson';

  return {
    ...previous,
    title: String(data.get('title') ?? '').trim(),
    startDate: String(data.get('startDate') ?? ''),
    endDate: String(data.get('endDate') ?? ''),
    totalStudents,
    actualParticipants,
    absentStudents,
    vulnerableStudents,
    vulnerableParticipants,
    vulnerableAbsent,
    chaperones: Math.max(0, number(data.get('chaperones'))),
    educationSupport: {
      ...previous.educationSupport,
      regularPerPerson: Math.max(0, number(data.get('regularPerPerson'))),
      vulnerableMode,
      vulnerablePerPerson: vulnerableMode === 'full'
        ? Math.max(0, number(previous.educationSupport.vulnerablePerPerson))
        : Math.max(0, number(data.get('vulnerablePerPerson')))
    },
    schoolSupport: {
      ...previous.schoolSupport,
      mode: previous.schoolSupport.mode,
      amount: Math.max(0, number(data.get('schoolSupportAmount')))
    },
    expenses: readExpenseRows(studentTbody, previous.expenses),
    staffExpenses: readExpenseRows(staffTbody, previous.staffExpenses ?? []),
    memo: String(data.get('memo') ?? '')
  };
}
