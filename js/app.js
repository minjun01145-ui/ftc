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
import { propagateSharedLinks } from './sharedCosts.js';
import { buildStaffDraft } from './staffDraft.js';
import { copyRichText, tableForPaste } from './forms/clipboard.js';
import { scheduleFormHtml, scheduleFormModel, scheduleFormText } from './forms/scheduleForm.js';
import { downloadScheduleHwpx } from './forms/scheduleHwpx.js';
import { costFormHtml, costFormModel, costFormText } from './forms/costForm.js';
import { downloadCostHwpx } from './forms/costHwpx.js';
import { downloadBlob } from './forms/hwpxPackage.js';
import { portalItemsFile } from './forms/portalItems.js';
import { buildProposal } from './proposalPlanner.js';
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
import { gradeStudentCount, headcountIssues, refreshHeadcountSummary } from './views/project/headcountSection.js';
import { addOtherSupportRow, moveOtherSupportRow, removeOtherSupportRow } from './views/project/budgetSection.js';
import {
  addFixedCostRow,
  applySharedCount,
  clearSharedCount,
  closeSharedPanel,
  openSharedPanel,
  removeFixedCostRow,
  restoreFixedCostRow,
  sharedCandidates,
  syncFixedCostModeControls
} from './views/project/fixedCostSection.js';
import { renderProjectList } from './views/sidebarView.js';
import { readSchoolForm, renderSchoolPage } from './views/schoolView.js';
import { renderHomePage } from './views/homeView.js';

const main = document.querySelector('#main');
const projectList = document.querySelector('#projectList');
const addProjectBtn = document.querySelector('#addProjectBtn');
const exportBtn = document.querySelector('#exportBtn');
const importInput = document.querySelector('#importInput');
const message = document.querySelector('#message');
const schoolNav = document.querySelector('[data-page="school"]');

const HOME_PAGE = Object.freeze({ type: 'home', projectId: null, section: null });
let currentPage = HOME_PAGE;
let dirty = false;
let messageTimer;
let schoolSearchRequestId = 0;
const schoolStudentLookup = createSchoolStudentLookup(getSchoolStudentCounts);

// 저장하지 않은 변경이 있으면 저장 버튼을 눈에 띄게 바꾼다(body.has-unsaved).
function setDirty(value) {
  dirty = value;
  document.body.classList.toggle('has-unsaved', value);
}

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
  markDirty: () => setDirty(true),
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
    setDirty(false);
    return;
  }

  const project = state.projects.find(item => item.id === currentPage.projectId);
  if (currentPage.type !== 'project' || !project) {
    currentPage = HOME_PAGE;
    main.innerHTML = renderHomePage(state.projects);
    setDirty(false);
    return;
  }

  main.innerHTML = renderProjectPage(project, state.school, currentPage.section);
  updateExpenseRowButtons(main.querySelector('#studentExpenseTableBody'));
  updateExpenseRowButtons(main.querySelector('#staffExpenseTableBody'));
  setDirty(false);
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
      && project.totalStudents === gradeStudentCount(state.school, project.grade)
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
        setDirty(true);
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

  let nextProject = readProjectForm(form, project);
  const schoolName = form.elements.schoolName;
  const withSchedule = tripSchedule.applyTo(form, nextProject);
  if (withSchedule) {
    nextProject = withSchedule;
    messageText = '체험학습 일정을 저장하고 체험처/비용에 반영했습니다.';
  }
  if (form.querySelector('[name="applicants"]')) {
    const attendance = nextProject.workflow?.attendance ?? {};
    const issues = headcountIssues({
      totalStudents: nextProject.totalStudents,
      applicants: attendance.applicants,
      vulnerableApplicants: attendance.vulnerableEnrolled,
      regularDayAbsent: attendance.regularDayAbsent,
      vulnerableDayAbsent: attendance.vulnerableDayAbsent
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
  // 기타비를 다른 학년과 함께 계산하면 상대 사업에도 연결과 계약액을 반영한다.
  updateState(next => {
    next.projects = propagateSharedLinks(next.projects, project, nextProject);
    if (schoolName) next.school = { ...next.school, name: schoolName.value.trim() };
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
  if (editingThis) currentPage = HOME_PAGE;
  render();
  showMessage('사업을 삭제했습니다.');
}

// 저장된 내용으로 새 사업 '○○ (복사)'를 만든다.
function copyProject(projectId) {
  const source = getState().projects.find(item => item.id === projectId);
  if (!source) return;
  if (!confirm(`'${source.title}' 사업을 복사할까요?`)) return;
  if (!canDiscardChanges()) return;
  const project = { ...structuredClone(source), id: createProject().id, title: `${source.title} (복사)` };
  updateState(state => {
    const index = state.projects.findIndex(item => item.id === projectId);
    state.projects.splice(index + 1, 0, project);
  });
  persistState();
  currentPage = projectPage(project.id);
  render();
  showMessage(`'${project.title}' 사업을 만들었습니다. 사업명과 학년을 바꿔 주세요.`);
}

projectList.addEventListener('click', event => {
  const copyButton = event.target.closest('[data-copy-project-id]');
  if (copyButton) {
    copyProject(copyButton.dataset.copyProjectId);
    return;
  }

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

  setDirty(true);
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
  if (target.matches('[data-headcount-input]')) refreshHeadcountSummary(target.form);
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

  setDirty(true);

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
    const schoolTotal = gradeStudentCount(getState().school, target.value);
    if (total && schoolTotal > 0) total.value = String(schoolTotal);
    refreshHeadcountSummary(target.form);
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
    setDirty(true);
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
    saveProject(form, '사업정보를 저장했습니다.');
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
    setDirty(true);
    return;
  }

  if (action === 'delete-source' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    button.closest('[data-resource-row]')?.remove();
    setDirty(true);
    return;
  }

  if (action === 'add-admin-entry' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    const tbody = form.querySelector('.admin-entry-table tbody');
    tbody?.querySelector('[data-admin-empty]')?.remove();
    tbody?.insertAdjacentHTML('beforeend', newAdminRowHtml(getState().projects.find(item => item.id === currentPage.projectId)));
    setDirty(true);
    return;
  }

  if (action === 'delete-admin-entry' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    button.closest('[data-admin-row]')?.remove();
    setDirty(true);
    return;
  }

  if (action === 'add-manual-allocation' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    const project = getState().projects.find(item => item.id === currentPage.projectId);
    const tbody = form.querySelector('.manual-allocation-table tbody');
    if (project && tbody) {
      tbody.querySelector('[data-manual-empty]')?.remove();
      tbody.insertAdjacentHTML('beforeend', newManualRowHtml(project));
      setDirty(true);
    }
    return;
  }

  if (action === 'delete-manual-allocation' && form?.dataset.projectView === PROJECT_SECTION.WORKFLOW) {
    button.closest('[data-manual-row]')?.remove();
    setDirty(true);
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
    setDirty(true);
    return;
  }

  if (action === 'delete-other-support') {
    removeOtherSupportRow(button);
    setDirty(true);
    return;
  }

  if (action === 'move-other-support-up' || action === 'move-other-support-down') {
    moveOtherSupportRow(button, action === 'move-other-support-up' ? 'up' : 'down');
    setDirty(true);
    return;
  }

  if (action === 'proposal-fill-budget') {
    proposal.fillBudget(button.dataset.budgetId);
    return;
  }

  if (action === 'copy-schedule-form') {
    const model = scheduleFormModel(currentProject());
    copyRichText(scheduleFormHtml(model), scheduleFormText(model))
      .then(() => showMessage('세부 일정표를 복사했습니다. 한글에서 붙여넣기(Ctrl+V) 하세요.'))
      .catch(error => showMessage(`복사하지 못했습니다: ${error.message}`));
    return;
  }

  if (action === 'download-schedule-hwpx') {
    const project = currentProject();
    if (!project) return;
    button.disabled = true;
    const filename = `${project.title || '체험학습'}_세부일정표.hwpx`.replace(/[\\/:*?"<>|]/g, '_');
    downloadScheduleHwpx(scheduleFormModel(project), filename)
      .then(() => showMessage('세부 일정표 HWPX 파일을 만들었습니다.'))
      .catch(error => showMessage(`파일을 만들지 못했습니다: ${error.message}`))
      .finally(() => { button.disabled = false; });
    return;
  }

  if (action === 'copy-cost-form') {
    const model = costFormModel(currentProject());
    copyRichText(costFormHtml(model), costFormText(model))
      .then(() => showMessage('경비 산출내역을 복사했습니다. 한글에서 붙여넣기(Ctrl+V) 하세요.'))
      .catch(error => showMessage(`복사하지 못했습니다: ${error.message}`));
    return;
  }

  if (action === 'download-cost-hwpx') {
    const project = currentProject();
    if (!project) return;
    button.disabled = true;
    const filename = `${project.title || '체험학습'}_경비산출내역.hwpx`.replace(/[\\/:*?"<>|]/g, '_');
    downloadCostHwpx(costFormModel(project), filename)
      .then(() => showMessage('경비 산출내역 HWPX 파일을 만들었습니다.'))
      .catch(error => showMessage(`파일을 만들지 못했습니다: ${error.message}`))
      .finally(() => { button.disabled = false; });
    return;
  }

  if (action === 'download-portal-items') {
    const project = currentProject();
    if (!project) return;
    const proposalData = buildProposal(project);
    const budget = proposalData.budgets.find(item => item.id === button.dataset.budgetId);
    if (!budget) return;
    const filename = `${project.title || '체험학습'}_품목내역_${budget.name}.xls`.replace(/[\\/:*?"<>|]/g, '_');
    downloadBlob(new Blob([portalItemsFile(proposalData, budget.id)], { type: 'application/vnd.ms-excel' }), filename);
    showMessage(`${budget.name} 품목내역 파일을 만들었습니다. 업무포털에서 이 예산을 고르고 올리세요.`);
    return;
  }

  if (action === 'copy-table') {
    const table = main.querySelector(button.dataset.copyTarget);
    if (!table) return;
    const { html, text } = tableForPaste(table);
    copyRichText(html, text)
      .then(() => showMessage('표를 복사했습니다. 한글에서 붙여넣기(Ctrl+V) 하세요.'))
      .catch(error => showMessage(`복사하지 못했습니다: ${error.message}`));
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

  if (action === 'open-shared-count') {
    const row = button.closest('[data-fixed-row]');
    openSharedPanel(button, sharedCandidates(getState().projects, currentPage.projectId, row));
    return;
  }

  if (action === 'close-shared-count') {
    closeSharedPanel(button);
    return;
  }

  // 다른 학년 인원을 넣거나 빼면 바로 저장해 1인당 금액을 다시 계산한다.
  if (action === 'apply-shared-projects' || action === 'apply-shared-manual') {
    if (!applySharedCount(button, action === 'apply-shared-projects' ? 'projects' : 'manual')) {
      showMessage(action === 'apply-shared-projects' ? '함께 계산할 사업을 선택해 주세요.' : '함께 계산할 인원을 입력해 주세요.');
      return;
    }
    if (form) saveProject(form, '다른 학년 인원을 더해 1인당 금액을 다시 계산하고 저장했습니다.');
    return;
  }

  if (action === 'clear-shared-count') {
    clearSharedCount(button);
    if (form) saveProject(form, '다른 학년과 함께 계산을 해제하고 저장했습니다.');
    return;
  }

  if (action === 'add-fixed-cost') {
    addFixedCostRow(button);
    setDirty(true);
    return;
  }

  if (action === 'restore-fixed-cost') {
    restoreFixedCostRow(button);
    setDirty(true);
    return;
  }

  if (action === 'delete-fixed-cost') {
    const label = button.closest('[data-fixed-row]')?.querySelector('th')?.firstChild?.textContent.trim()
      || button.closest('[data-fixed-row]')?.querySelector('[data-fixed-field="label"]')?.value || '이 항목';
    if (!confirm(`기타비 '${label}'을(를) 삭제할까요? 저장하면 반영됩니다.`)) return;
    removeFixedCostRow(button);
    setDirty(true);
    return;
  }

  const saveActions = {
    'save-all': '이 페이지의 내용을 모두 저장했습니다.',
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
    setDirty(true);
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
    setDirty(true);
    showMessage(`인솔자용 초안 ${draft.length}개 항목을 만들었습니다. 확인하고 고친 뒤 저장하세요.`);
    return;
  }

  if (action === 'delete-expense' && tbody && expenseId) {
    removeExpenseRow(tbody, expenseId);
    setDirty(true);
    return;
  }

  if ((action === 'move-expense-up' || action === 'move-expense-down') && tbody && expenseId) {
    moveExpenseRow(tbody, expenseId, action === 'move-expense-up' ? 'up' : 'down');
    setDirty(true);
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
  // 기본 파일 이름: 내보낸 날짜와 시각(예: 2026-09-29-2145.json)
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  downloadJson(`${stamp}.json`, getState());
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
    currentPage = HOME_PAGE;
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
