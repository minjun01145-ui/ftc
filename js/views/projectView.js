import { allocateFunding, projectCounts, validateProject } from '../engine.js';
import { escapeHtml, formatWon, number } from '../utils.js';
import { readExpenseRows, renderExpenseRows } from './expenseTable.js';

function money(value) {
  return formatWon(Math.round(number(value)));
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
          <tr><th>${label} 인솔자경비 합계</th><td>${money(allocation.expenses.staffTotal)}</td></tr>
          <tr class="total"><th>${label} 전체 비용</th><td>${money(allocation.expenses.total)}</td></tr>
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

export function renderProjectPage(project, school) {
  const counts = projectCounts(project);
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

      <fieldset>
        <legend>인원 및 지원기준</legend>
        <div class="form-grid">
          <label for="totalStudents">총학생수</label>
          <input id="totalStudents" name="totalStudents" type="number" min="0" value="${number(project.totalStudents)}">
          <label for="actualParticipants">실제 참가학생수</label>
          <input id="actualParticipants" name="actualParticipants" type="number" min="0" value="${number(project.actualParticipants)}">

          <label for="absentStudents">불참자수</label>
          <input id="absentStudents" name="absentStudents" type="number" min="0" value="${number(project.absentStudents)}">
          <label for="chaperones">인솔자수</label>
          <input id="chaperones" name="chaperones" type="number" min="0" value="${number(project.chaperones)}">

          <label for="vulnerableParticipants">취약계층 참가학생수</label>
          <input id="vulnerableParticipants" name="vulnerableParticipants" type="number" min="0" value="${number(project.vulnerableParticipants)}">
          <label for="vulnerableAbsent">취약계층 불참자수</label>
          <input id="vulnerableAbsent" name="vulnerableAbsent" type="number" min="0" value="${number(project.vulnerableAbsent)}">

          <label>비취약 참가학생수</label>
          <input readonly value="${counts.regularParticipants}">
          <label>비취약 불참자수</label>
          <input readonly value="${counts.regularAbsent}">

          <label for="regularPerPerson">교육청 지원금(비취약 1인당)</label>
          <input id="regularPerPerson" name="regularPerPerson" type="number" min="0" value="${number(project.educationSupport.regularPerPerson)}">
          <label for="grantTotal">교육청 실제 교부액</label>
          <input id="grantTotal" name="grantTotal" type="number" min="0" placeholder="정산용, 선택 입력" value="${project.educationSupport.grantTotal ?? ''}">

          <label for="vulnerableMode">교육청 지원금(취약계층)</label>
          <select id="vulnerableMode" name="vulnerableMode">
            <option value="full" ${project.educationSupport.vulnerableMode === 'full' ? 'selected' : ''}>실비 전액</option>
            <option value="perPerson" ${project.educationSupport.vulnerableMode === 'perPerson' ? 'selected' : ''}>1인당 정액</option>
          </select>
          <label for="vulnerablePerPerson">취약계층 1인당 지원액</label>
          <input id="vulnerablePerPerson" name="vulnerablePerPerson" type="number" min="0" value="${number(project.educationSupport.vulnerablePerPerson)}" ${project.educationSupport.vulnerableMode === 'full' ? 'disabled' : ''}>

          <label for="schoolSupportMode">학교 자체지원금 방식</label>
          <select id="schoolSupportMode" name="schoolSupportMode">
            <option value="total" ${project.schoolSupport.mode === 'total' ? 'selected' : ''}>총액</option>
            <option value="perPersonRegular" ${project.schoolSupport.mode === 'perPersonRegular' ? 'selected' : ''}>비취약 참가학생 1인당</option>
          </select>
          <label for="schoolSupportAmount">학교 자체지원금</label>
          <input id="schoolSupportAmount" name="schoolSupportAmount" type="number" min="0" value="${number(project.schoolSupport.amount)}">
        </div>
        <p class="help">교육청 지원금과 학교 자체지원금은 아래 비용 항목의 위쪽부터 순서대로 배분합니다.</p>
      </fieldset>

      ${renderValidation(project)}

      <h2>체험처/비용</h2>
      <div class="toolbar">
        <button type="button" data-action="add-expense">항목 추가</button>
        <span class="help">입력한 뒤 저장하면 계산 결과가 갱신됩니다.</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>순서</th><th>일자</th><th>체험처/항목</th><th>계산방법</th><th>대상인원</th><th>직접수량</th><th>단가/총액</th>
              <th>학생 계획액</th><th>인솔자 계획액</th><th>실제 지출액</th><th>학생 정산액</th><th></th>
            </tr>
          </thead>
          <tbody id="expenseTableBody">${renderExpenseRows(project)}</tbody>
        </table>
      </div>

      <h2>계획 계산</h2>
      ${renderSummaryTable(project, false)}
      <h2>계획 재원 배분</h2>
      ${renderAllocationTable(project, false)}

      <h2>정산</h2>
      <p class="help">비용표의 ‘실제 지출액’을 입력하고 저장하면 정산 금액이 갱신됩니다. 비워두면 계획 금액을 사용합니다.</p>
      ${renderSummaryTable(project, true)}
      <h2>정산 재원 배분</h2>
      ${renderAllocationTable(project, true)}

      <fieldset>
        <legend>메모</legend>
        <textarea name="memo">${escapeHtml(project.memo)}</textarea>
      </fieldset>

      <div class="page-actions">
        <button type="submit">저장</button>
        <button type="button" data-action="print">인쇄</button>
        <button type="button" class="danger" data-action="delete-project">이 사업 삭제</button>
      </div>
    </form>
  `;
}

export function readProjectForm(form, previous) {
  const data = new FormData(form);
  const tbody = form.querySelector('#expenseTableBody');
  const grantValue = data.get('grantTotal');
  const vulnerableMode = data.get('vulnerableMode') === 'perPerson' ? 'perPerson' : 'full';

  return {
    ...previous,
    title: String(data.get('title') ?? '').trim(),
    startDate: String(data.get('startDate') ?? ''),
    endDate: String(data.get('endDate') ?? ''),
    totalStudents: Math.max(0, number(data.get('totalStudents'))),
    actualParticipants: Math.max(0, number(data.get('actualParticipants'))),
    absentStudents: Math.max(0, number(data.get('absentStudents'))),
    vulnerableParticipants: Math.max(0, number(data.get('vulnerableParticipants'))),
    vulnerableAbsent: Math.max(0, number(data.get('vulnerableAbsent'))),
    chaperones: Math.max(0, number(data.get('chaperones'))),
    educationSupport: {
      ...previous.educationSupport,
      regularPerPerson: Math.max(0, number(data.get('regularPerPerson'))),
      vulnerableMode,
      vulnerablePerPerson: vulnerableMode === 'full'
        ? previous.educationSupport.vulnerablePerPerson
        : Math.max(0, number(data.get('vulnerablePerPerson'))),
      grantTotal: grantValue === '' || grantValue == null ? null : Math.max(0, number(grantValue))
    },
    schoolSupport: {
      ...previous.schoolSupport,
      mode: data.get('schoolSupportMode') === 'perPersonRegular' ? 'perPersonRegular' : 'total',
      amount: Math.max(0, number(data.get('schoolSupportAmount')))
    },
    expenses: readExpenseRows(tbody, previous.expenses),
    memo: String(data.get('memo') ?? '')
  };
}
