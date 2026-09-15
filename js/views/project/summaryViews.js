import { allocateFunding, calculateExpenses, projectCounts, validateProject } from '../../engine.js';
import { escapeHtml, formatWon, number } from '../../utils.js';

export function money(value) {
  return formatWon(Math.round(number(value)));
}

export function vulnerableStudentTotal(project) {
  if (project.vulnerableStudents !== undefined && project.vulnerableStudents !== null) {
    return Math.max(0, number(project.vulnerableStudents));
  }
  return Math.max(0, number(project.vulnerableParticipants) + number(project.vulnerableAbsent));
}

export function vulnerableFullPerPerson(project) {
  const counts = projectCounts(project);
  if (counts.vulnerableParticipants <= 0) return 0;

  const expenses = calculateExpenses(project, true);
  const participantCost = expenses.rows.reduce((sum, row) => sum + row.cohortCosts.vulnerable, 0);
  return participantCost / counts.vulnerableParticipants;
}

export function renderAllocationTable(project, settlement) {
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

export function renderSummaryTable(project, settlement) {
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

export function renderValidation(project) {
  const validation = validateProject(project, false);
  if (!validation.issues.length) {
    return '<div class="status-box"><span class="ok-text">입력값 검증: 이상 없음</span></div>';
  }
  return `<div class="status-box"><span class="error-text">확인할 항목이 있습니다.</span><ul>${validation.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul></div>`;
}

export function renderHeadcountReport(project) {
  const counts = projectCounts(project);
  const vulnerableTotal = vulnerableStudentTotal(project);
  const totalParticipants = counts.participants + counts.chaperones;

  return `
    <div class="report-text" aria-live="polite">
      <p>총학생수 ${counts.total}명 중 학생 불참자는 ${counts.absent}명으로 실제 참가학생 수는 ${counts.participants}명입니다. 인솔자 수는 ${counts.chaperones}명입니다. 총 참가자 수(인솔자 포함)는 ${totalParticipants}명입니다.</p>
      <p>취약계층은 ${vulnerableTotal}명이며 그 중 불참자는 ${counts.vulnerableAbsent}명입니다.</p>
    </div>`;
}
