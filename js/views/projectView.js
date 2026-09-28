import { PROJECT_SECTION, normalizeProjectSection } from '../projectSections.js';
import { escapeHtml, number } from '../utils.js';
import { readExpenseRows } from './expenseTable.js';
import { renderBudgetSection } from './project/budgetSection.js';
import { renderBusinessInfoSection } from './project/businessInfoSection.js';
import { renderExpenseSections } from './project/expenseSections.js';
import { renderHeadcountSection } from './project/headcountSection.js';
import { renderReportSection } from './project/reportSection.js';
import { renderSettlementSection } from './project/settlementSection.js';
import { renderTripScheduleSection } from './project/tripScheduleSection.js';
import { createFundingSource } from '../presets.js';
import { summarizeAttendance } from '../workflowEngine.js';

function renderBusinessSections(project, school) {
  return `${renderBusinessInfoSection(project, school)}${renderTripScheduleSection(project)}`;
}

function renderOverview(project, school) {
  return `
    ${renderBusinessSections(project, school)}
    ${renderHeadcountSection(project, school)}
    ${renderExpenseSections(project)}
    ${renderBudgetSection(project)}
    ${renderReportSection(project, { showPrint: false })}
    ${renderSettlementSection(project, { showPrint: false })}
    <div class="page-actions">
      <button type="submit">전체 저장</button>
      <button type="button" class="danger" data-action="delete-project">이 사업 삭제</button>
    </div>`;
}

function renderSection(project, school, section) {
  switch (section) {
    case PROJECT_SECTION.BUSINESS:
      return renderBusinessSections(project, school);
    case PROJECT_SECTION.HEADCOUNT:
      return renderHeadcountSection(project, school);
    case PROJECT_SECTION.EXPENSES:
      return renderExpenseSections(project);
    case PROJECT_SECTION.BUDGET:
      return renderBudgetSection(project);
    case PROJECT_SECTION.REPORT:
      return renderReportSection(project);
    case PROJECT_SECTION.SETTLEMENT:
      return renderSettlementSection(project);
    case PROJECT_SECTION.OVERVIEW:
    default:
      return renderOverview(project, school);
  }
}

export function renderProjectPage(project, school, requestedSection = PROJECT_SECTION.BUSINESS) {
  const section = normalizeProjectSection(requestedSection);
  return `
    <h1>${escapeHtml(project.title)}</h1>
    <form id="projectForm" data-project-id="${escapeHtml(project.id)}" data-project-view="${section}">
      ${renderSection(project, school, section)}
    </form>`;
}

function has(data, name) {
  return data.has(name);
}

function countInput(value) {
  const text = String(value ?? '').trim();
  return text === '' ? 0 : Number(text);
}

// 인원 화면은 실제 참여자와 그 중 취약계층만 받으므로 불참·미신청 단계는 0으로 둡니다.
function headcountAttendance(previousAttendance, previousTotal, { participants, vulnerableParticipants }) {
  const legacy = previousAttendance.schema === 'legacy-v5' || previousAttendance.legacyAttendance
    ? { legacyAttendance: previousAttendance.legacyAttendance ?? previousAttendance }
    : {};
  return {
    schema: 'core-v1',
    applicants: participants,
    chaperones: summarizeAttendance(previousAttendance, previousTotal).chaperones,
    vulnerableEnrolled: vulnerableParticipants,
    vulnerableNotApplied: 0,
    vulnerableDayAbsent: 0,
    regularDayAbsent: 0,
    ...legacy
  };
}

export function readProjectForm(form, previous) {
  const data = new FormData(form);
  const next = { ...previous };

  if (has(data, 'title')) next.title = String(data.get('title') ?? '').trim();
  if (has(data, 'startDate')) next.startDate = String(data.get('startDate') ?? '');
  if (has(data, 'endDate')) next.endDate = String(data.get('endDate') ?? '');
  if (has(data, 'grade')) next.grade = data.get('grade') ? number(data.get('grade')) : '';
  if (has(data, 'executionMode')) next.executionMode = String(data.get('executionMode') ?? '숙박형');
  if (has(data, 'place')) next.place = String(data.get('place') ?? '').trim();
  if (has(data, 'days')) next.days = Math.max(0, number(data.get('days')));

  if (has(data, 'totalStudents')) {
    const rawTotal = String(data.get('totalStudents') ?? '');
    next.totalStudents = rawTotal === '' ? 0 : Number(rawTotal);
    if (has(data, 'actualParticipants')) {
      next.workflow = {
        ...next.workflow,
        attendance: headcountAttendance(next.workflow?.attendance ?? {}, previous.totalStudents, {
          participants: countInput(data.get('actualParticipants')),
          vulnerableParticipants: countInput(data.get('vulnerableParticipants'))
        })
      };
    }
    const summary = summarizeAttendance(next.workflow?.attendance ?? {}, next.totalStudents);
    next.actualParticipants = summary.participants;
    next.absentStudents = Math.max(0, summary.enrolled - summary.participants);
    next.vulnerableStudents = summary.vulnerableEnrolled;
    next.vulnerableParticipants = summary.vulnerableParticipants;
    next.vulnerableAbsent = summary.vulnerableAbsent;
    next.chaperones = summary.chaperones;
  }

  if (has(data, 'regularPerPerson') || has(data, 'vulnerablePerPerson') || has(data, 'vulnerableFullSupport') || has(data, 'grantTotal')) {
    const vulnerableMode = has(data, 'vulnerableFullSupport') ? 'full' : 'perPerson';
    next.educationSupport = {
      ...previous.educationSupport,
      regularPerPerson: has(data, 'regularPerPerson')
        ? Math.max(0, number(data.get('regularPerPerson')))
        : previous.educationSupport.regularPerPerson,
      vulnerableMode,
      vulnerablePerPerson: vulnerableMode === 'full'
        ? Math.max(0, number(previous.educationSupport.vulnerablePerPerson))
        : has(data, 'vulnerablePerPerson')
          ? Math.max(0, number(data.get('vulnerablePerPerson')))
          : previous.educationSupport.vulnerablePerPerson,
      grantTotal: has(data, 'grantTotal')
        ? (data.get('grantTotal') === '' ? null : Math.max(0, number(data.get('grantTotal'))))
        : previous.educationSupport.grantTotal
    };
    const resources = [...(next.workflow?.resources ?? [])];
    const education = resources.find(item => item.reportClass === 'education') ?? createFundingSource({ name: '교육청 지원금', reportClass: 'education' });
    Object.assign(education, {
      issuedAmount: next.educationSupport.grantTotal,
      eligibleGroups: ['vulnerable', 'regular', 'vulnerableAbsent'],
      limits: {
        ...education.limits,
        vulnerable: vulnerableMode === 'full' ? null : next.educationSupport.vulnerablePerPerson,
        regular: next.educationSupport.regularPerPerson,
        vulnerableAbsent: vulnerableMode === 'full' ? null : next.educationSupport.vulnerablePerPerson
      }
    });
    if (!resources.includes(education)) resources.push(education);
    next.workflow = { ...next.workflow, resources };
  }

  if (has(data, 'schoolSupportAmount')) {
    next.schoolSupport = {
      ...previous.schoolSupport,
      amount: Math.max(0, number(data.get('schoolSupportAmount')))
    };
    const resources = [...(next.workflow?.resources ?? [])];
    const school = resources.find(item => item.reportClass === 'school') ?? createFundingSource({
      name: '학교 자체지원금', reportClass: 'school', priority: 20, eligibleGroups: ['regular']
    });
    Object.assign(school, {
      issuedAmount: next.schoolSupport.mode === 'perPersonRegular' ? null : next.schoolSupport.amount,
      eligibleGroups: ['regular'],
      limits: { ...school.limits, regular: next.schoolSupport.mode === 'perPersonRegular' ? next.schoolSupport.amount : null }
    });
    if (!resources.includes(school)) resources.push(school);
    next.workflow = { ...next.workflow, resources };
  }

  const studentTbody = form.querySelector('#studentExpenseTableBody');
  if (studentTbody) next.expenses = readExpenseRows(studentTbody, previous.expenses);

  const staffTbody = form.querySelector('#staffExpenseTableBody');
  if (staffTbody) next.staffExpenses = readExpenseRows(staffTbody, previous.staffExpenses ?? []);

  if (has(data, 'memo')) next.memo = String(data.get('memo') ?? '');

  return next;
}
