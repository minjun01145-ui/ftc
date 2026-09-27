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
import { renderWorkflowSection } from './project/workflowSection.js';
import { createFundingSource } from '../presets.js';

function renderBusinessSections(project, school) {
  return `${renderBusinessInfoSection(project, school)}${renderTripScheduleSection(project)}`;
}

function renderOverview(project, school) {
  return `
    ${renderBusinessSections(project, school)}
    ${renderHeadcountSection(project)}
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
    case PROJECT_SECTION.WORKFLOW:
      return renderWorkflowSection(project, school);
    case PROJECT_SECTION.BUSINESS:
      return renderBusinessSections(project, school);
    case PROJECT_SECTION.HEADCOUNT:
      return renderHeadcountSection(project);
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

export function renderProjectPage(project, school, requestedSection = PROJECT_SECTION.WORKFLOW) {
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

export function readProjectForm(form, previous) {
  const data = new FormData(form);
  const next = { ...previous };

  if (has(data, 'title')) next.title = String(data.get('title') ?? '').trim();
  if (has(data, 'startDate')) next.startDate = String(data.get('startDate') ?? '');
  if (has(data, 'endDate')) next.endDate = String(data.get('endDate') ?? '');
  if (has(data, 'grade')) next.grade = data.get('grade') ? number(data.get('grade')) : '';
  if (has(data, 'schoolLevel')) next.schoolLevel = String(data.get('schoolLevel') ?? '중');
  if (has(data, 'establishment')) next.establishment = String(data.get('establishment') ?? '공립');
  if (has(data, 'executionMode')) next.executionMode = String(data.get('executionMode') ?? '숙박형');
  if (has(data, 'place')) next.place = String(data.get('place') ?? '').trim();
  if (has(data, 'days')) next.days = Math.max(0, number(data.get('days')));

  if (has(data, 'totalStudents') || has(data, 'absentStudents') || has(data, 'vulnerableStudents') || has(data, 'vulnerableAbsent') || has(data, 'chaperones')) {
    const totalStudents = has(data, 'totalStudents') ? Math.max(0, number(data.get('totalStudents'))) : Math.max(0, number(previous.totalStudents));
    const absentStudents = has(data, 'absentStudents') ? Math.max(0, number(data.get('absentStudents'))) : Math.max(0, number(previous.absentStudents));
    const vulnerableStudents = has(data, 'vulnerableStudents') ? Math.max(0, number(data.get('vulnerableStudents'))) : Math.max(0, number(previous.vulnerableStudents));
    const vulnerableAbsent = has(data, 'vulnerableAbsent') ? Math.max(0, number(data.get('vulnerableAbsent'))) : Math.max(0, number(previous.vulnerableAbsent));

    const headcountChanged = totalStudents !== number(previous.totalStudents)
      || absentStudents !== number(previous.absentStudents)
      || vulnerableStudents !== number(previous.vulnerableStudents)
      || vulnerableAbsent !== number(previous.vulnerableAbsent)
      || (has(data, 'chaperones') && number(data.get('chaperones')) !== number(previous.chaperones));
    next.totalStudents = totalStudents;
    next.absentStudents = absentStudents;
    next.actualParticipants = Math.max(0, totalStudents - absentStudents);
    next.vulnerableStudents = vulnerableStudents;
    next.vulnerableAbsent = vulnerableAbsent;
    next.vulnerableParticipants = Math.max(0, vulnerableStudents - vulnerableAbsent);
    if (has(data, 'chaperones')) next.chaperones = Math.max(0, number(data.get('chaperones')));
    if (headcountChanged) {
      const attendance = next.workflow?.attendance ?? {};
      next.workflow = {
        ...next.workflow,
        attendance: {
          ...attendance,
          enrolled: totalStudents,
          notApplied: Math.max(0, totalStudents - (Math.max(0, totalStudents - absentStudents) + absentStudents)),
          preContractCanceled: 0,
          postContractCanceled: absentStudents,
          dayAbsent: 0,
          chaperones: next.chaperones,
          vulnerableEnrolled: vulnerableStudents,
          vulnerableNotApplied: 0,
          vulnerablePreContractCanceled: 0,
          vulnerablePostContractCanceled: vulnerableAbsent,
          vulnerableDayAbsent: 0,
          fixedCostAbsent: Math.min(absentStudents, number(attendance.fixedCostAbsent))
        }
      };
    }
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
