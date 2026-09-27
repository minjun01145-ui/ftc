import { PROJECT_SECTION, normalizeProjectSection } from './projectSections.js';
import { createProject } from './presets.js';
import { buildProposalLines, calculateWorkflow, createConfirmedPlanSnapshot, summarizeAttendance } from './workflowEngine.js';
import { downloadWorkflowWorkbook } from './services/workbookExport.js';
import { getSchoolStudentCounts, searchSchools } from './services/schoolInfo.js';
import { createSchoolStudentLookup } from './services/schoolStudentLookup.js';
import { scheduleUploadErrorMessage, validateScheduleFiles } from './services/scheduleUpload.js';
import { createScheduleDocumentImportService } from './services/scheduleDocumentImport.js';
import { createDefaultAiClient } from './ai/createDefaultAiClient.js';
import { getState, persistState, replaceState, updateState } from './state.js';
import { syncExpensesFromTripSchedule } from './tripSchedule.js';
import { downloadJson, escapeHtml, number } from './utils.js';
import {
  addExpenseRow,
  cloneExpensesForStaff,
  moveExpenseGroup,
  readExpenseRows,
  removeExpenseGroup,
  replaceExpenseRows,
  syncExpenseDetailAvailability,
  toggleCustomQuantity,
  toggleExpenseDetailEditor,
  toggleExpenseDetailView,
  updateExpenseRowButtons
} from './views/expenseTable.js';
import { readProjectForm, renderProjectPage } from './views/projectView.js';
import { newAdminRowHtml, newManualRowHtml, newSourceRowHtml, readWorkflowForm } from './views/project/workflowSection.js';
import {
  newTripScheduleRowHtml,
  readTripScheduleSection,
  replaceTripScheduleDraft,
  setTripScheduleEditing,
  setTripScheduleUploadStatus
} from './views/project/tripScheduleSection.js';
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
let scheduleDocumentRequestId = 0;
const scheduleDocumentImport = createScheduleDocumentImportService({ aiClient: createDefaultAiClient() });
const schoolStudentLookup = createSchoolStudentLookup(getSchoolStudentCounts);

function projectPage(projectId, section = PROJECT_SECTION.BUSINESS) {
  return { type: 'project', projectId, section: normalizeProjectSection(section) };
}

function showMessage(text) {
  message.textContent = text;
  message.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => message.classList.remove('show'), 1800);
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
  updateState(next => { next.school = school; });
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

function saveTripSchedule(form) {
  const state = getState();
  const project = state.projects.find(item => item.id === currentPage.projectId);
  const section = form.querySelector('[data-trip-schedule-section]');
  if (!project || !section) return;

  const tripSchedule = readTripScheduleSection(section, project.tripSchedule);
  const expenses = syncExpensesFromTripSchedule(tripSchedule, project.expenses);
  updateState(next => {
    const index = next.projects.findIndex(item => item.id === currentPage.projectId);
    if (index < 0) return;
    next.projects[index] = {
      ...next.projects[index],
      tripSchedule,
      expenses
    };
  });
  persistState();
  render();
  showMessage('체험학습 일정을 저장하고 체험처/비용에 반영했습니다.');
}

async function importTripScheduleDocument(input) {
  const section = input.closest('[data-trip-schedule-section]');
  const form = input.form;
  const requestId = ++scheduleDocumentRequestId;
  const validation = validateScheduleFiles(input.files);
  if (validation.error) {
    setTripScheduleUploadStatus(input, scheduleUploadErrorMessage(validation.error), { error: true });
    input.value = '';
    return;
  }

  const [file] = validation.accepted;
  const project = getState().projects.find(item => item.id === currentPage.projectId);
  if (!project || !section || !form) {
    input.value = '';
    return;
  }

  input.disabled = true;
  setTripScheduleUploadStatus(input, '분석 중...');
  try {
    const items = await scheduleDocumentImport.importFile(file, {
      projectTitle: project.title,
      schoolYear: getState().school.schoolYear,
      startDate: project.startDate,
      endDate: project.endDate
    });
    if (!main.contains(form) || requestId !== scheduleDocumentRequestId) return;
    if (!items.length) {
      setTripScheduleUploadStatus(input, '일정 항목을 찾지 못했습니다. 기존 일정은 그대로입니다.');
      return;
    }
    if (!replaceTripScheduleDraft(section, items)) {
      setTripScheduleUploadStatus(input, '일정 초안을 만들지 못했습니다. 기존 일정은 그대로입니다.', { error: true });
      return;
    }
    dirty = true;
    setTripScheduleUploadStatus(input, `${items.length}개 일정을 초안으로 가져왔습니다. 확인한 뒤 저장해 주세요.`);
  } catch (error) {
    if (!main.contains(form) || requestId !== scheduleDocumentRequestId) return;
    const messageText = ['AI_NOT_CONFIGURED', 'AI_MODEL_NOT_CONFIGURED'].includes(error.code)
      ? '문서 일정 가져오기가 설정되지 않았습니다.'
      : error.message || '문서에서 일정을 읽지 못했습니다.';
    setTripScheduleUploadStatus(input, messageText, { error: true });
  } finally {
    input.value = '';
    input.disabled = false;
  }
}

function goTo(page) {
  if (!canDiscardChanges()) return;
  currentPage = page;
  render();
}

schoolNav.addEventListener('click', () => {
  goTo({ type: 'school', projectId: null, section: null });
});

projectList.addEventListener('click', event => {
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
  if (target.dataset.detailField !== undefined) {
    const editor = target.closest('[data-expense-detail-editor]');
    const tbody = target.closest('tbody');
    if (editor && tbody) syncExpenseDetailAvailability(tbody, editor.dataset.expenseDetailEditor);
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
    void importTripScheduleDocument(target);
    return;
  }
  if (target.matches('[data-school-search]')) return;

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

  if (target.dataset.field === 'quantityBase') {
    const row = target.closest('[data-expense-row]');
    if (row) toggleCustomQuantity(row);
  }
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
    setTripScheduleEditing(button.closest('[data-trip-schedule-section]'), true);
    return;
  }

  if (action === 'add-schedule-item') {
    const section = button.closest('[data-trip-schedule-section]');
    const tbody = section?.querySelector('tbody');
    if (!tbody) return;
    tbody.querySelector('[data-trip-schedule-empty]')?.remove();
    tbody.insertAdjacentHTML('beforeend', newTripScheduleRowHtml());
    setTripScheduleEditing(section, true);
    dirty = true;
    return;
  }

  if (action === 'save-trip-schedule' && form) {
    saveTripSchedule(form);
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

  const saveActions = {
    'save-business': '사업정보를 저장했습니다.',
    'save-headcount': '인원 정보를 저장했습니다.',
    'save-budget': '예산 정보를 저장했습니다.',
    'save-student-expenses': '학생용 체험처/비용을 저장했습니다.',
    'save-staff-expenses': '인솔자용 체험처/비용을 저장했습니다.',
    'save-report': '리포트 메모를 저장했습니다.'
  };

  if (saveActions[action] && form) {
    saveProject(form, saveActions[action]);
    return;
  }

  if (action === 'add-expense' && tbody) {
    const project = getState().projects.find(item => item.id === currentPage.projectId);
    if (!project) return;
    const kind = button.dataset.expenseKind === 'staff' ? 'staff' : 'student';
    addExpenseRow(tbody, project, form?.elements.startDate?.value ?? project.startDate ?? '', kind);
    dirty = true;
    return;
  }

  if (action === 'copy-student-expenses' && form) {
    const project = getState().projects.find(item => item.id === currentPage.projectId);
    const studentTbody = form.querySelector('#studentExpenseTableBody');
    const staffTbody = form.querySelector('#staffExpenseTableBody');
    if (!project || !studentTbody || !staffTbody) return;

    const staffHasRows = staffTbody.querySelector('[data-expense-row]');
    if (staffHasRows && !confirm('현재 인솔자용 작성 내용이 있습니다. 학생용 내용으로 덮어쓸까요?')) return;

    const currentStudentExpenses = readExpenseRows(studentTbody, project.expenses);
    const copied = cloneExpensesForStaff(currentStudentExpenses);
    replaceExpenseRows(staffTbody, copied, project, 'staff', false);
    dirty = true;
    showMessage('학생용 작성 내용을 인솔자용에 붙여넣었습니다. 저장하면 반영됩니다.');
    return;
  }

  if (action === 'delete-expense' && tbody && expenseId) {
    removeExpenseGroup(tbody, expenseId);
    dirty = true;
    return;
  }

  if ((action === 'move-expense-up' || action === 'move-expense-down') && tbody && expenseId) {
    moveExpenseGroup(tbody, expenseId, action === 'move-expense-up' ? 'up' : 'down');
    dirty = true;
    return;
  }

  if (action === 'edit-expense-details' && tbody && expenseId) {
    toggleExpenseDetailEditor(tbody, expenseId);
    return;
  }

  if (action === 'close-detail-editor') {
    const detailTbody = button.closest('tbody');
    if (detailTbody && expenseId) toggleExpenseDetailEditor(detailTbody, expenseId, true);
    return;
  }

  if (action === 'toggle-expense-details' && tbody && expenseId) {
    toggleExpenseDetailView(tbody, expenseId);
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

  if (action === 'delete-project') {
    const project = getState().projects.find(item => item.id === currentPage.projectId);
    if (!project) return;
    const warning = dirty
      ? `'${project.title}' 사업을 삭제할까요?\n저장하지 않은 변경사항도 함께 사라집니다.`
      : `'${project.title}' 사업을 삭제할까요?`;
    if (!confirm(warning)) return;

    updateState(state => {
      state.projects = state.projects.filter(item => item.id !== currentPage.projectId);
    });
    persistState();
    currentPage = { type: 'school', projectId: null, section: null };
    render();
  }
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
