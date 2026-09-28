import { PROJECT_SECTION, normalizeProjectSection } from '../projectSections.js';
import { escapeHtml, number } from '../utils.js';
import { summarizeAttendance } from '../workflowEngine.js';
import { readExpenseRows } from './expenseTable.js';
import { readBudgetInputs, renderBudgetSection } from './project/budgetSection.js';
import { renderBusinessInfoSection } from './project/businessInfoSection.js';
import { renderExpenseSections } from './project/expenseSections.js';
import { readFixedCostInputs } from './project/fixedCostSection.js';
import { headcountAttendance, readHeadcountInputs, renderHeadcountSection } from './project/headcountSection.js';
import { renderPreTripSection } from './project/preTripSection.js';
import { readProposalInputs, renderProposalSection } from './project/proposalSection.js';
import { renderReportSection } from './project/reportSection.js';
import { renderSettlementSection } from './project/settlementSection.js';
import { renderTripScheduleSection } from './project/tripScheduleSection.js';

const SECTION_RENDERERS = Object.freeze({
  [PROJECT_SECTION.BUSINESS]: (project, school) => `${renderBusinessInfoSection(project, school)}${renderTripScheduleSection(project)}`,
  [PROJECT_SECTION.HEADCOUNT]: renderHeadcountSection,
  [PROJECT_SECTION.EXPENSES]: renderExpenseSections,
  [PROJECT_SECTION.BUDGET]: renderBudgetSection,
  [PROJECT_SECTION.PRE_TRIP]: renderPreTripSection,
  [PROJECT_SECTION.PROPOSAL]: renderProposalSection,
  [PROJECT_SECTION.REPORT]: renderReportSection,
  [PROJECT_SECTION.SETTLEMENT]: renderSettlementSection
});

export function renderProjectPage(project, school, requestedSection = PROJECT_SECTION.BUSINESS) {
  const section = normalizeProjectSection(requestedSection);
  return `
    <h1>${escapeHtml(project.title)}</h1>
    <form id="projectForm" data-project-id="${escapeHtml(project.id)}" data-project-view="${section}">
      ${SECTION_RENDERERS[section](project, school)}
    </form>`;
}

function applyHeadcount(next, previous, data) {
  const rawTotal = String(data.get('totalStudents') ?? '');
  next.totalStudents = rawTotal === '' ? 0 : Number(rawTotal);
  const headcount = readHeadcountInputs(data);
  if (headcount) {
    next.dayAbsentSharesCommonCost = headcount.dayAbsentSharesCommonCost;
    next.workflow = {
      ...next.workflow,
      attendance: headcountAttendance(next.workflow?.attendance ?? {}, previous.totalStudents, headcount)
    };
  }
  const summary = summarizeAttendance(next.workflow?.attendance ?? {}, next.totalStudents);
  next.actualParticipants = summary.participants;
  next.absentStudents = Math.max(0, summary.enrolled - summary.participants);
  // 당일 불참자는 계약 후 불참이므로 '학생 총액' 항목과 공통비용의 수량(참여 + 당일 불참)에 들어간다.
  next.contractedAbsentStudents = summary.vulnerableAbsent + summary.regularAbsent;
  next.vulnerableContractedAbsent = summary.vulnerableAbsent;
  next.regularContractedAbsent = summary.regularAbsent;
  next.vulnerableStudents = summary.vulnerableEnrolled;
  next.vulnerableParticipants = summary.vulnerableParticipants;
  next.vulnerableAbsent = summary.vulnerableAbsent;
  next.chaperones = summary.chaperones;
}

/** 현재 화면에 있는 입력칸만 읽어 사업 데이터에 반영한다. 화면에 없는 값은 그대로 둔다. */
export function readProjectForm(form, previous) {
  const data = new FormData(form);
  const next = { ...previous };

  if (data.has('title')) next.title = String(data.get('title') ?? '').trim();
  if (data.has('startDate')) next.startDate = String(data.get('startDate') ?? '');
  if (data.has('endDate')) next.endDate = String(data.get('endDate') ?? '');
  if (data.has('grade')) next.grade = data.get('grade') ? number(data.get('grade')) : '';
  if (data.has('totalStudents')) applyHeadcount(next, previous, data);

  next.fixedCosts = readFixedCostInputs(data, previous.fixedCosts);

  const budget = readBudgetInputs(form, data, previous);
  if (budget) Object.assign(next, budget);

  const proposal = readProposalInputs(form);
  if (proposal) next.proposalPlan = proposal;

  const studentTbody = form.querySelector('#studentExpenseTableBody');
  if (studentTbody) next.expenses = readExpenseRows(studentTbody, previous.expenses);

  const staffTbody = form.querySelector('#staffExpenseTableBody');
  if (staffTbody) next.staffExpenses = readExpenseRows(staffTbody, previous.staffExpenses ?? []);

  if (data.has('memo')) next.memo = String(data.get('memo') ?? '');

  return next;
}
