import { PROJECT_SECTION, normalizeProjectSection } from '../projectSections.js';
import { escapeHtml, number } from '../utils.js';
import { readExpenseRows } from './expenseTable.js';
import { renderBudgetSection } from './project/budgetSection.js';
import { renderBusinessInfoSection } from './project/businessInfoSection.js';
import { renderExpenseSections } from './project/expenseSections.js';
import { renderHeadcountSection } from './project/headcountSection.js';
import { renderReportSection } from './project/reportSection.js';
import { renderSettlementSection } from './project/settlementSection.js';

function renderOverview(project, school) {
  return `
    ${renderBusinessInfoSection(project, school)}
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
    case PROJECT_SECTION.BUSINESS:
      return renderBusinessInfoSection(project, school);
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

export function renderProjectPage(project, school, requestedSection = PROJECT_SECTION.OVERVIEW) {
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

  if (has(data, 'totalStudents') || has(data, 'absentStudents') || has(data, 'vulnerableStudents') || has(data, 'vulnerableAbsent') || has(data, 'chaperones')) {
    const totalStudents = has(data, 'totalStudents') ? Math.max(0, number(data.get('totalStudents'))) : Math.max(0, number(previous.totalStudents));
    const absentStudents = has(data, 'absentStudents') ? Math.max(0, number(data.get('absentStudents'))) : Math.max(0, number(previous.absentStudents));
    const vulnerableStudents = has(data, 'vulnerableStudents') ? Math.max(0, number(data.get('vulnerableStudents'))) : Math.max(0, number(previous.vulnerableStudents));
    const vulnerableAbsent = has(data, 'vulnerableAbsent') ? Math.max(0, number(data.get('vulnerableAbsent'))) : Math.max(0, number(previous.vulnerableAbsent));

    next.totalStudents = totalStudents;
    next.absentStudents = absentStudents;
    next.actualParticipants = Math.max(0, totalStudents - absentStudents);
    next.vulnerableStudents = vulnerableStudents;
    next.vulnerableAbsent = vulnerableAbsent;
    next.vulnerableParticipants = Math.max(0, vulnerableStudents - vulnerableAbsent);
    if (has(data, 'chaperones')) next.chaperones = Math.max(0, number(data.get('chaperones')));
  }

  if (has(data, 'regularPerPerson') || has(data, 'vulnerablePerPerson') || has(data, 'vulnerableFullSupport')) {
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
          : previous.educationSupport.vulnerablePerPerson
    };
  }

  if (has(data, 'schoolSupportAmount')) {
    next.schoolSupport = {
      ...previous.schoolSupport,
      amount: Math.max(0, number(data.get('schoolSupportAmount')))
    };
  }

  const studentTbody = form.querySelector('#studentExpenseTableBody');
  if (studentTbody) next.expenses = readExpenseRows(studentTbody, previous.expenses);

  const staffTbody = form.querySelector('#staffExpenseTableBody');
  if (staffTbody) next.staffExpenses = readExpenseRows(staffTbody, previous.staffExpenses ?? []);

  if (has(data, 'memo')) next.memo = String(data.get('memo') ?? '');

  return next;
}
