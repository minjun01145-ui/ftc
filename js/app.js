import { PROJECT_SECTION, normalizeProjectSection } from './projectSections.js';
import { createProject } from './presets.js';
import { buildProposalLines, calculateWorkflow, createConfirmedPlanSnapshot, summarizeAttendance } from './workflowEngine.js';
import { downloadWorkflowWorkbook } from './services/workbookExport.js';
import { getSchoolStudentCounts, searchSchools } from './services/schoolInfo.js';
import { createSchoolStudentLookup } from './services/schoolStudentLookup.js';
import { createScheduleDocumentImportService } from './services/scheduleDocumentImport.js';
import { createLocalScheduleImportService } from './services/localScheduleImport.js';
import { SCHEDULE_IMPORT_ENGINE } from './config/importConfig.js';
import { createKakaoPlaceSearch } from './services/kakaoPlaces.js';
import { KAKAO_JAVASCRIPT_KEY } from './config/kakaoConfig.js';
import { createDefaultAiClient } from './ai/createDefaultAiClient.js';
import { createProposalController } from './controllers/proposalController.js';
import { createTripScheduleController } from './controllers/tripScheduleController.js';
import { buildStaffDraft } from './staffDraft.js';
import { getState, persistState, replaceState, updateState } from './state.js';
import { downloadJson, escapeHtml, number } from './utils.js';
import {
  addExpenseRow,
  moveExpenseRow,
  removeExpenseRow,
  replaceExpenseRows,
  updateExpenseRowButtons
} from './views/expenseTable.js';
import { readProjectForm, renderProjectPage } from './views/projectView.js';
import { newAdminRowHtml, newManualRowHtml, newSourceRowHtml, readWorkflowForm } from './views/project/workflowSection.js';
import { gradeStudentCount, headcountIssues } from './views/project/headcountSection.js';
import { addOtherSupportRow, moveOtherSupportRow, removeOtherSupportRow } from './views/project/budgetSection.js';
import { addFixedCostRow, removeFixedCostRow, syncFixedCostModeControls } from './views/project/fixedCostSection.js';
import { renderProjectList } from './views/sidebarView.js';
import { readSchoolForm, renderSchoolPage } from './views/schoolView.js';

const main = document.querySelector('#main');
const projectList = document.querySelector('#projectList');
const addProjectBtn = document.querySelector('#addProjectBtn');
const exportBtn = document.querySelector('#exportBtn');
const importInput = document.querySelector('#importInput');
const message = document.querySelector('#message');
const schoolNav = document.querySelector('[data-page="school"]');

let currentPage = { type: 'school', projectId: null, section: null };
let dirty = false;
let messageTimer;
let schoolSearchRequestId = 0;
const schoolStudentLookup = createSchoolStudentLookup(getSchoolStudentCounts);

function currentProject() {
  return getState().projects.find(item => item.id === currentPage.projectId) ?? null;
}

function replaceCurrentProject(nextProject) {
  updateState(next => {
    const index = next.projects.findIndex(item => item.id === currentPage.projectId);
    if (index >= 0) next.projects[index] = nextProject;
  });
  persistState();
  render();
}

const proposal = createProposalController({
  getProject: currentProject,
  saveProject: replaceCurrentProject,
  showMessage
});

// 기본은 AI 없이 문서를 직접 읽는다. AI 분석은 설정(importConfig.js)으로만 켠다.
function createDocumentImportService() {
  return SCHEDULE_IMPORT_ENGINE === 'ai'
    ? createScheduleDocumentImportService({ aiClient: createDefaultAiClient() })
    : createLocalScheduleImportService();
}

const tripSchedule = createTripScheduleController({
  documentImport: createDocumentImportService(),
  placeSearch: createKakaoPlaceSearch({ javascriptKey: KAKAO_JAVASCRIPT_KEY }),
  getProject: currentProject,
  getSchoolYear: () => getState().school.schoolYear,
  saveProject: replaceCurrentProject,
  isFormAttached: form => main.contains(form),
  markDirty: () => { dirty = true; },
  showMessage
});

function projectPage(projectId, section = PROJECT_SECTION.BUSINESS) {
  return { type: 'project', projectId, section: normalizeProjectSection(section) };
}

function showMessage(text) {
  message.textContent = text;
  message.classList.add('show');
  clearTimeout(messageTimer);
  // 긴 안내(예산 초과 등)는 읽을 시간을 더 준다.
  messageTimer = setTimeout(() => message.classList.remove('show'), Math.max(1800, text.length * 90));
}

function renderSidebar() {
  const state = getState();
  schoolNav.classList.toggle('active', currentPage.type === 'school');
  projectList.innerHTML = renderProjectList(state.projects, currentPage);
}

function render() {
  renderSidebar();
  const state = getState();

  if (currentPage.type === 'school') {
    main.innerHTML = renderSchoolPage(state.school);
    dirty = false;
    return;
  }

  const project = state.projects.find(item => item.id === currentPage.projectId);
  if (!project) {
    currentPage = { type: 'school', projectId: null, section: null };
    render();
    return;
  }

  main.innerHTML = renderProjectPage(project, state.school, currentPage.section);
  updateExpenseRowButtons(main.querySelector('#studentExpenseTableBody'));
  updateExpenseRowButtons(main.querySelector('#staffExpenseTableBody'));
  dirty = false;
}

function canDiscardChanges() {
  if (!dirty) return true;
  return confirm('저장하지 않은 변경사항이 있습니다. 저장하지 않고 이동할까요?');
}

function saveSchool(form) {
  const state = getState();
  const school = readSchoolForm(form, state.school);
  updateState(next => {
    next.school = school;
    next.projects = next.projects.map(project => (project.grade
      ? { ...project, totalStudents: gradeStudentCount(school, project.grade) }
      : project));
  });
  persistState();
  render();
  showMessage('저장했습니다.');
}

function updateSchoolTotal(form) {
  const totalField = form?.querySelector('#schoolTotalStudents');
  if (!totalField) return;
  const grade1 = number(form.querySelector('[name="grade1Students"]')?.value);
  const grade2 = number(form.querySelector('[name="grade2Students"]')?.value);
  const grade3 = number(form.querySelector('[name="grade3Students"]')?.value);
  totalField.value = String(grade1 + grade2 + grade3);
}

function clearSelectedSchool(form) {
  for (const name of ['schoolCode', 'schoolRegionCode', 'schoolKindCode']) {
    const field = form.querySelector(`[name="${name}"]`);
    if (field) field.value = '';
  }
}

function setSchoolStatus(form, text) {
  const status = form?.querySelector('#schoolSearchStatus');
  if (status) status.textContent = text;
}

function renderSchoolSearchResults(schools) {
  return schools.map(school => `
    <button type="button" class="school-search-result" role="option" data-action="select-school"
      data-school-code="${escapeHtml(school.schoolCode)}"
      data-school-name="${escapeHtml(school.name)}"
      data-school-type="${escapeHtml(school.schoolType)}"
      data-school-office="${escapeHtml(school.educationOffice)}"
      data-school-region="${escapeHtml(school.schoolRegionCode)}"
      data-school-kind-code="${escapeHtml(school.schoolKindCode)}"
      data-school-address="${escapeHtml(school.address)}"
      data-school-homepage="${escapeHtml(school.homepage)}">
      <strong>${escapeHtml(school.name)}</strong>
      <small>${escapeHtml(school.schoolType)} · ${escapeHtml(school.address)}</small>
    </button>
  `).join('');
}

async function searchSchoolDirectory(form, button) {
  const officeField = form.querySelector('[name="educationOffice"]');
  const queryField = form.querySelector('[name="schoolQuery"]');
  const status = form.querySelector('#schoolSearchStatus');
  const results = form.querySelector('#schoolSearchResults');
  const educationOffice = officeField.value;
  const query = queryField.value.trim();

  if (!educationOffice) {
    status.textContent = '먼저 교육지원청을 선택해 주세요.';
    results.innerHTML = '';
    return;
  }

  const requestId = ++schoolSearchRequestId;
  button.disabled = true;
  status.textContent = '학교알리미 학교기본정보에서 학교 목록을 찾고 있습니다.';
  results.innerHTML = '';
  try {
    const schools = await searchSchools({ educationOffice, query });
    if (!main.contains(form) || requestId !== schoolSearchRequestId) return;
    results.innerHTML = renderSchoolSearchResults(schools);
    status.textContent = schools.length
      ? `검색 결과 ${schools.length}개입니다. 학교를 선택하면 학생수를 자동 조회합니다.`
      : '검색 결과가 없습니다. 학교명이나 교육지원청을 확인해 주세요.';
  } catch (error) {
    if (!main.contains(form) || requestId !== schoolSearchRequestId) return;
    status.textContent = error.message;
  } finally {
    if (requestId === schoolSearchRequestId) button.disabled = false;
  }
}

function normalizeHomepage(value) {
  const homepage = String(value ?? '').trim();
  if (!homepage || /^[a-z][a-z0-9+.-]*:\/\//i.test(homepage)) return homepage;
  return `https://${homepage}`;
}

async function lookupSchoolStudents(form) {
  const educationOffice = form.querySelector('[name="educationOffice"]').value;
  const schoolCode = form.querySelector('[name="schoolCode"]').value;
  const schoolRegionCode = form.querySelector('[name="schoolRegionCode"]').value;
  const schoolYearField = form.querySelector('[name="schoolYear"]');
  const requestedSchoolYear = schoolYearField.value;
  const requestedYear = number(requestedSchoolYear);
  const reportYear = Math.min(requestedYear, new Date().getFullYear());
  const countFields = ['grade1Students', 'grade2Students', 'grade3Students']
    .map(name => form.querySelector(`[name="${name}"]`));
  const countsAtRequest = countFields.map(field => field.value);

  const requestIsCurrent = () => main.contains(form)
    && form.querySelector('[name="schoolCode"]').value === schoolCode
    && form.querySelector('[name="educationOffice"]').value === educationOffice
    && form.querySelector('[name="schoolRegionCode"]').value === schoolRegionCode
    && schoolYearField.value === requestedSchoolYear
    && countFields.every((field, index) => field.value === countsAtRequest[index]);

  if (!educationOffice || !schoolCode || !schoolRegionCode) {
    setSchoolStatus(form, '학교 검색 결과에서 학교를 선택해 주세요.');
    return;
  }
  if (!reportYear) {
    setSchoolStatus(form, '학년도를 입력한 뒤 학교를 선택해 주세요.');
    return;
  }

  setSchoolStatus(form, `${reportYear}년 공시 학생수를 조회하고 있습니다.`);
  try {
    const outcome = await schoolStudentLookup.lookup({
      educationOffice, schoolCode, schoolRegionCode, reportYear
    }, {
      isCurrent: requestIsCurrent,
      apply(result) {
        form.querySelector('[name="grade1Students"]').value = String(result.counts.grade1Students);
        form.querySelector('[name="grade2Students"]').value = String(result.counts.grade2Students);
        form.querySelector('[name="grade3Students"]').value = String(result.counts.grade3Students);
        updateSchoolTotal(form);
        dirty = true;
      }
    });
    if (!outcome.applied) return;
    setSchoolStatus(form, `${outcome.result.reportYear}년 학교알리미 공시값을 불러왔습니다. 학생수를 확인하고 수정한 뒤 저장해 주세요.`);
  } catch (error) {
    setSchoolStatus(form, error.message);
  }
}

function saveProject(form, messageText = '저장했습니다.') {
  const state = getState();
  const project = state.projects.find(item => item.id === currentPage.projectId);
  if (!project) return;

  const nextProject = readProjectForm(form, project);
  if (form.querySelector('[name="actualParticipants"]')) {
    const attendance = nextProject.workflow?.attendance ?? {};
    const issues = headcountIssues({
      totalStudents: nextProject.totalStudents,
      participants: attendance.applicants - attendance.regularDayAbsent,
      dayAbsent: attendance.regularDayAbsent,
      vulnerableParticipants: attendance.vulnerableEnrolled
    });
    if (issues.length) {
      showMessage(issues[0]);
      return;
    }
  }
  if (form.querySelector('[name="totalStudents"]')) {
    const issues = summarizeAttendance(nextProject.workflow?.attendance ?? {}, nextProject.totalStudents).issues;
    if (issues.length) {
      showMessage(issues[0]);
      return;
    }
  }
  updateState(next => {
    const index = next.projects.findIndex(item => item.id === currentPage.projectId);
    if (index >= 0) next.projects[index] = nextProject;
  });
  persistState();
  render();
  showMessage(messageText);
}

function saveWorkflow(form, messageText = '업무 흐름을 저장했습니다.') {
  const state = getState();
  const project = state.projects.find(item => item.id === currentPage.projectId);
  if (!project) return null;
  const nextProject = readWorkflowForm(form, project);
  const attendanceIssues = [
    ...summarizeAttendance(nextProject.workflow.attendance, nextProject.totalStudents).issues,
    ...summarizeAttendance(nextProject.workflow.actual.attendance, nextProject.totalStudents).issues
  ];
  if (attendanceIssues.length) {
    showMessage(attendanceIssues[0]);
    return null;
  }
  updateState(next => {
    const index = next.projects.findIndex(item => item.id === currentPage.projectId);
    if (index >= 0) next.projects[index] = nextProject;
  });
  persistState();
  render();
  showMessage(messageText);
  return getState().projects.find(item => item.id === currentPage.projectId) ?? null;
}

function confirmWorkflowPlan(form) {
  const state = getState();
  const current = state.projects.find(item => item.id === currentPage.projectId);
  if (!current) return;
  const nextProject = readWorkflowForm(form, current);
  const attendanceIssues = [
    ...summarizeAttendance(nextProject.workflow.attendance, nextProject.totalStudents).issues,
    ...summarizeAttendance(nextProject.workflow.actual.attendance, nextProject.totalStudents).issues
  ];
  if (attendanceIssues.length) {
    showMessage(attendanceIssues[0]);
    return;
  }
  const snapshot = createConfirmedPlanSnapshot(nextProject, state.school);
  const revision = (nextProject.workflow.confirmedPlans?.length ?? 0) + 1;
  snapshot.revision = revision;
  snapshot.changeReason = nextProject.workflow.planChangeReason;
  nextProject.workflow.confirmedPlans = [...(nextProject.workflow.confirmedPlans ?? []), snapshot];
  nextProject.workflow.activeConfirmedPlanId = snapshot.id;
  nextProject.workflow.confirmedPlan = snapshot;
  updateState(next => {
    const index = next.projects.findIndex(item => item.id === currentPage.projectId);
    if (index >= 0) next.projects[index] = nextProject;
  });
  persistState();
  render();
  showMessage(`품의용 확정 계획 ${revision}차를 저장했습니다. 이전 확정본도 보존했습니다.`);
}

function goTo(page) {
  if (!canDiscardChanges()) return;
  currentPage = page;
  render();
}

schoolNav.addEventListener('click', () => {
  goTo({ type: 'school', projectId: null, section: null });
});

function deleteProject(projectId) {
  const project = getState().projects.find(item => item.id === projectId);
  if (!project) return;
  const editingThis = currentPage.type === 'project' && currentPage.projectId === projectId;
  const warning = editingThis && dirty
    ? `'${project.title}' 사업을 삭제할까요?\n저장하지 않은 변경사항도 함께 사라집니다.`
    : `'${project.title}' 사업을 삭제할까요?`;
  if (!confirm(warning)) return;
  if (!editingThis && !canDiscardChanges()) return;

  updateState(state => {
    state.projects = state.projects.filter(item => item.id !== projectId);
  });
  persistState();
  if (editingThis) currentPage = { type: 'school', projectId: null, section: null };
  render();
  showMessage('사업을 삭제했습니다.');
}

projectList.addEventListener('click', event => {
  const deleteButton = event.target.closest('[data-delete-project-id]');
  if (deleteButton) {
    deleteProject(deleteButton.dataset.deleteProjectId);
    return;
  }

  const button = event.target.closest('[data-project-id]');
  if (!button) return;

  const projectId = button.dataset.projectId;
  const requestedSection = button.dataset.projectSection ?? PROJECT_SECTION.BUSINESS;
  const nextPage = projectPage(projectId, requestedSection);

  if (currentPage.type === 'project'
      && currentPage.projectId === nextPage.projectId
      && currentPage.section === nextPage.section) return;

  goTo(nextPage);
});

addProjectBtn.addEventListener('click', () => {
  if (!canDiscardChanges()) return;
  const project = createProject();
  updateState(state => { state.projects.push(project); });
  persistState();
  currentPage = projectPage(project.id);
  render();
});

main.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'schoolForm') saveSchool(form);
  if (form.id === 'projectForm' && form.dataset.projectView === PROJECT_SECTION.WORKFLOW) saveWorkflow(form);
  else if (form.id === 'projectForm') saveProject(form);
});

main.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !event.target.matches('[data-school-search]')) return;
  event.preventDefault();
  main.querySelector('[data-action="search-schools"]')?.click();
});

main.addEventListener('input', event => {
  const target = event.target;
  if (target.matches('[data-trip-schedule-upload]')) return;
  if (target.matches('[data-school-search]')) {
    schoolSearchRequestId += 1;
    const form = target.form;
    const searchButton = form?.querySelector('[data-action="search-schools"]');
    const results = form?.querySelector('#schoolSearchResults');
    const status = form?.querySelector('#schoolSearchStatus');
    if (searchButton) searchButton.disabled = false;
    if (results) results.innerHTML = '';
    if (status) status.textContent = '검색어를 바꿨습니다. 다시 검색해 주세요.';
    return;
  }

  dirty = true;
  if (target.form?.id === 'schoolForm' && target.name === 'name') {
    schoolStudentLookup.invalidate();
    clearSelectedSchool(target.form);
    setSchoolStatus(target.form, '학교명을 수정했습니다. 학생수를 자동 조회하려면 학교를 다시 검색해 선택해 주세요.');
  }
  if (target.form?.id === 'schoolForm'
      && ['grade1Students', 'grade2Students', 'grade3Students'].includes(target.name)) {
    schoolStudentLookup.invalidate();
    updateSchoolTotal(target.form);
    setSchoolStatus(target.form, '학생수를 확인하고 실제 인원에 맞게 수정한 뒤 저장해 주세요.');
  }
  if (target.form?.id === 'schoolForm' && target.name === 'schoolYear') {
    schoolStudentLookup.invalidate();
    setSchoolStatus(target.form, '학년도를 바꿨습니다. 학교를 다시 선택하면 학생수를 조회합니다.');
  }
  if (target.matches('[data-cost-field="quantityBase"]')) {
    const row = target.closest('[data-cost-row]');
    const direct = row?.nextElementSibling;
    if (direct?.matches('[data-custom-row]')) direct.hidden = target.value !== 'custom';
    const quantity = row?.querySelector('[data-cost-field="customQuantity"]');
    if (quantity) quantity.disabled = target.value !== 'custom';
  }
});

main.addEventListener('change', event => {
  const target = event.target;

  if (target.matches('[data-trip-schedule-upload]')) {
    void tripSchedule.importDocument(target);
    return;
  }
  if (target.matches('[data-school-search]')) return;

  // 품의 도우미는 체크하는 즉시 저장해 다시 계산한다.
  if (target.matches('[data-proposal-toggle]')) {
    proposal.toggle(target.dataset.budgetId, target.dataset.lineId, target.checked);
    return;
  }
  if (target.matches('[data-proposal-budget-amount]')) {
    proposal.updateBudgetAmount(target.dataset.budgetId, target.value);
    return;
  }

  dirty = true;

  if (target.id === 'educationOffice') {
    schoolSearchRequestId += 1;
    schoolStudentLookup.invalidate();
    target.form.querySelector('[data-action="search-schools"]').disabled = false;
    clearSelectedSchool(target.form);
    target.form.querySelector('#schoolSearchResults').innerHTML = '';
    target.form.querySelector('#schoolSearchStatus').textContent = target.value
      ? '학교명을 검색하거나 비워 두고 학교 검색을 눌러 목록을 확인하세요.'
      : '교육지원청을 선택한 뒤 학교를 검색하세요.';
    setSchoolStatus(target.form, '학교명을 검색해 학교를 선택하면 학생수를 자동 조회합니다.');
    return;
  }

  if (target.matches('[data-headcount-grade]')) {
    const total = target.form?.elements.totalStudents;
    if (total) total.value = target.value ? String(gradeStudentCount(getState().school, target.value)) : '';
  }

  if (target.name === 'vulnerableFullSupport') {
    const form = target.form;
    const amount = form?.elements.vulnerablePerPerson;
    if (amount) {
      if (target.checked) {
        amount.dataset.manualValue = amount.value;
        amount.value = amount.dataset.autoValue ?? '0';
        amount.readOnly = true;
      } else {
        amount.readOnly = false;
        amount.value = amount.dataset.manualValue ?? '0';
      }
    }
  }

  if (target.matches('[data-fixed-cost-mode]')) syncFixedCostModeControls(target);
});

main.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.dataset.action;
  const form = button.closest('form');
  const expenseSection = button.closest('[data-expense-section]');
  const tbody = expenseSection?.querySelector('[data-expense-table]');
  const row = button.closest('[data-expense-row]');
  const expenseId = row?.dataset.expenseId ?? button.dataset.expenseId ?? '';

  if (action === 'search-schools' && form?.id === 'schoolForm') {
    void searchSchoolDirectory(form, button);
    return;
  }

  if (action === 'select-school' && form?.id === 'schoolForm') {
    schoolSearchRequestId += 1;
    schoolStudentLookup.invalidate();
    form.querySelector('[data-action="search-schools"]').disabled = false;
    form.querySelector('[name="educationOffice"]').value = button.dataset.schoolOffice ?? '';
    form.querySelector('[name="name"]').value = button.dataset.schoolName ?? '';
    form.querySelector('[name="homepage"]').value = normalizeHomepage(button.dataset.schoolHomepage);
    form.querySelector('[name="schoolCode"]').value = button.dataset.schoolCode ?? '';
    form.querySelector('[name="schoolRegionCode"]').value = button.dataset.schoolRegion ?? '';
    form.querySelector('[name="schoolKindCode"]').value = button.dataset.schoolKindCode ?? '';
    form.querySelector('#schoolSearchResults').innerHTML = '';
    form.querySelector('#schoolSearchStatus').textContent = `${button.dataset.schoolName ?? '학교'}를 선택했습니다.`;
    setSchoolStatus(form, '학교를 선택했습니다. 학생수를 조회하고 있습니다.');
    dirty = true;
    void lookupSchoolStudents(form);
    return;
  }

  if (action === 'edit-trip-schedule') {
    tripSchedule.startEditing(button);
    return;
  }

  if (action === 'add-schedule-item') {
    tripSchedule.addRow(button);
    return;
  }

  if (action === 'search-schedule-place') {
    void tripSchedule.searchPlace(button);
    return;
  }

  if (action === 'save-trip-schedule' && form) {
    tripSchedule.save(form);
    return;
  }

  if (action === 'save-workflow' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    saveWorkflow(form);
    return;
  }

  if (action === 'confirm-plan' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    confirmWorkflowPlan(form);
    return;
  }

  if (action === 'add-source' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    form.querySelector('.resource-list')?.insertAdjacentHTML('beforeend', newSourceRowHtml());
    form.querySelector('.resource-list .empty')?.remove();
    dirty = true;
    return;
  }

  if (action === 'delete-source' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    button.closest('[data-resource-row]')?.remove();
    dirty = true;
    return;
  }

  if (action === 'add-admin-entry' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    const tbody = form.querySelector('.admin-entry-table tbody');
    tbody?.querySelector('[data-admin-empty]')?.remove();
    tbody?.insertAdjacentHTML('beforeend', newAdminRowHtml(getState().projects.find(item => item.id === currentPage.projectId)));
    dirty = true;
    return;
  }

  if (action === 'delete-admin-entry' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    button.closest('[data-admin-row]')?.remove();
    dirty = true;
    return;
  }

  if (action === 'add-manual-allocation' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    const project = getState().projects.find(item => item.id === currentPage.projectId);
    const tbody = form.querySelector('.manual-allocation-table tbody');
    if (project && tbody) {
      tbody.querySelector('[data-manual-empty]')?.remove();
      tbody.insertAdjacentHTML('beforeend', newManualRowHtml(project));
      dirty = true;
    }
    return;
  }

  if (action === 'delete-manual-allocation' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    button.closest('[data-manual-row]')?.remove();
    dirty = true;
    return;
  }

  if (action === 'copy-proposal' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    if (dirty) { alert('복사하기 전에 먼저 저장해 주세요.'); return; }
    const project = getState().projects.find(item => item.id === currentPage.projectId);
    const state = getState();
    const lines = project?.workflow?.confirmedPlan?.proposalLines
      ?? (project ? buildProposalLines(calculateWorkflow(project, state.school), project) : []);
    const header = ['일자', '항목', '대상', '재원', '수량', '단가(원)', '금액(원)', '산식', '비고'];
    const body = lines.map(row => [row.date, row.name, row.group, row.source, row.quantity, row.unitAmount, row.amount, row.calculation, row.note]);
    navigator.clipboard.writeText([header, ...body].map(row => row.join('\t')).join('\n'))
      .then(() => showMessage('품의용 표를 복사했습니다.'))
      .catch(error => showMessage(`표 복사에 실패했습니다: ${error.message}`));
    return;
  }

  if (action === 'export-workbook' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    if (dirty) { alert('파일 출력 전에 먼저 저장해 주세요.'); return; }
    try {
      const state = getState();
      downloadWorkflowWorkbook(state.projects, state.school);
      showMessage('공식 정산서와 검토 시트를 만들었습니다.');
    } catch (error) {
      showMessage(`XLSX 생성 실패: ${error.message}`);
    }
    return;
  }

  if (action === 'print-workflow' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    if (dirty) { alert('인쇄하기 전에 먼저 저장해 주세요.'); return; }
    window.print();
    return;
  }

  if (action === 'add-other-support') {
    addOtherSupportRow(button.closest('[data-budget-section]'));
    dirty = true;
    return;
  }

  if (action === 'delete-other-support') {
    removeOtherSupportRow(button);
    dirty = true;
    return;
  }

  if (action === 'move-other-support-up' || action === 'move-other-support-down') {
    moveOtherSupportRow(button, action === 'move-other-support-up' ? 'up' : 'down');
    dirty = true;
    return;
  }

  if (action === 'proposal-fill-budget') {
    proposal.fillBudget(button.dataset.budgetId);
    return;
  }

  if (action === 'copy-text') {
    navigator.clipboard.writeText(button.dataset.copyText ?? '')
      .then(() => showMessage('복사했습니다. 서식의 해당 칸에 붙여넣으세요.'))
      .catch(error => showMessage(`복사하지 못했습니다: ${error.message}`));
    return;
  }

  if (action === 'proposal-clear-budget') {
    proposal.clearBudget(button.dataset.budgetId);
    return;
  }

  if (action === 'add-fixed-cost') {
    addFixedCostRow(button);
    dirty = true;
    return;
  }

  if (action === 'delete-fixed-cost') {
    removeFixedCostRow(button);
    dirty = true;
    return;
  }

  const saveActions = {
    'save-business': '사업정보를 저장했습니다.',
    'save-headcount': '인원 정보를 저장했습니다.',
    'save-budget': '예산 정보를 저장했습니다.',
    'save-student-expenses': '학생용 체험처/비용을 저장했습니다.',
    'save-staff-expenses': '인솔자용 체험처/비용을 저장했습니다.'
  };

  if (saveActions[action] && form) {
    saveProject(form, saveActions[action]);
    return;
  }

  if (action === 'add-expense' && tbody) {
    const project = getState().projects.find(item => item.id === currentPage.projectId);
    if (!project) return;
    const kind = button.dataset.expenseKind === 'staff' ? 'staff' : 'student';
    addExpenseRow(tbody, project.startDate ?? '', kind);
    dirty = true;
    return;
  }

  if (action === 'draft-staff-expenses' && form) {
    const project = currentProject();
    const staffTbody = form.querySelector('#staffExpenseTableBody');
    if (!project || !staffTbody) return;
    if (staffTbody.querySelector('[data-expense-row]') && !confirm('현재 인솔자용 작성 내용이 있습니다. 초안으로 덮어쓸까요?')) return;

    // 아직 저장하지 않은 학생용 표와 기타비 입력도 초안에 반영한다.
    const draft = buildStaffDraft(readProjectForm(form, project));
    replaceExpenseRows(staffTbody, draft, 'staff');
    dirty = true;
    showMessage(`인솔자용 초안 ${draft.length}개 항목을 만들었습니다. 확인하고 고친 뒤 저장하세요.`);
    return;
  }

  if (action === 'delete-expense' && tbody && expenseId) {
    removeExpenseRow(tbody, expenseId);
    dirty = true;
    return;
  }

  if ((action === 'move-expense-up' || action === 'move-expense-down') && tbody && expenseId) {
    moveExpenseRow(tbody, expenseId, action === 'move-expense-up' ? 'up' : 'down');
    dirty = true;
    return;
  }

  if (action === 'print') {
    if (dirty) {
      alert('인쇄하기 전에 먼저 저장해 주세요.');
      return;
    }
    window.print();
    return;
  }

  if (action === 'delete-project') deleteProject(currentPage.projectId);
});

exportBtn.addEventListener('click', () => {
  if (dirty) {
    alert('저장하지 않은 변경사항이 있습니다. 먼저 저장해 주세요.');
    return;
  }
  const state = getState();
  const schoolName = state.school.name || '학교';
  downloadJson(`${schoolName}_현장체험학습_자료.json`.replace(/[\\/:*?"<>|]/g, '_'), state);
  showMessage('저장 파일을 만들었습니다.');
});

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;

  if (!canDiscardChanges()) {
    importInput.value = '';
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || !parsed.school || !Array.isArray(parsed.projects)) {
      throw new Error('형식 오류');
    }
    replaceState(parsed);
    persistState();
    currentPage = { type: 'school', projectId: null, section: null };
    render();
    showMessage('저장 파일을 불러왔습니다.');
  } catch {
    showMessage('올바른 저장 파일이 아닙니다.');
  } finally {
    importInput.value = '';
  }
});

window.addEventListener('beforeunload', event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

render();
