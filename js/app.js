import { PROJECT_SECTION, normalizeProjectSection } from './projectSections.js';
import { createProject } from './presets.js';
import { buildProposalLines, calculateWorkflow, createConfirmedPlanSnapshot, summarizeAttendance } from './workflowEngine.js';
import { downloadWorkflowWorkbook } from './services/workbookExport.js';
import { createLocalScheduleImportService } from './services/localScheduleImport.js';
import { createProposalController } from './controllers/proposalController.js';
import { createTripScheduleController } from './controllers/tripScheduleController.js';
import { propagateSharedLinks } from './sharedCosts.js';
import { buildStaffDraft } from './staffDraft.js';
import { copyRichText, tableForPaste } from './forms/clipboard.js';
import { scheduleFormHtml, scheduleFormModel, scheduleFormText } from './forms/scheduleForm.js';
import { downloadScheduleHwpx } from './forms/scheduleHwpx.js';
import { costFormHtml, costFormModel, costFormText } from './forms/costForm.js';
import { downloadCostHwpx } from './forms/costHwpx.js';
import { getState, persistState, replaceState, updateState } from './state.js';
import { downloadJson } from './utils.js';
import {
  addExpenseRow,
  moveExpenseRow,
  removeExpenseRow,
  replaceExpenseRows,
  updateExpenseRowButtons
} from './views/expenseTable.js';
import { readProjectForm, renderProjectPage } from './views/projectView.js';
import { newAdminRowHtml, newManualRowHtml, newSourceRowHtml, readWorkflowForm } from './views/project/workflowSection.js';
import { headcountIssues, refreshHeadcountSummary } from './views/project/headcountSection.js';
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
import { renderHomePage } from './views/homeView.js';

const main = document.querySelector('#main');
const projectList = document.querySelector('#projectList');
const addProjectBtn = document.querySelector('#addProjectBtn');
const exportBtn = document.querySelector('#exportBtn');
const importInput = document.querySelector('#importInput');
const message = document.querySelector('#message');
const HOME_PAGE = Object.freeze({ type: 'home', projectId: null, section: null });

let currentPage = HOME_PAGE;
let dirty = false;
let messageTimer;

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

const tripSchedule = createTripScheduleController({
  documentImport: createLocalScheduleImportService(),
  getProject: currentProject,
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
  projectList.innerHTML = renderProjectList(state.projects, currentPage);
}

function render() {
  renderSidebar();
  const state = getState();

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
  if (form.id === 'projectForm' && form.dataset.projectView === PROJECT_SECTION.WORKFLOW) saveWorkflow(form);
  else if (form.id === 'projectForm') saveProject(form);
});

main.addEventListener('input', event => {
  const target = event.target;
  if (target.matches('[data-trip-schedule-upload]')) return;
  setDirty(true);
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

  if (target.matches('[data-headcount-input]')) refreshHeadcountSummary(target.form);

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

  if (action === 'edit-trip-schedule') {
    tripSchedule.startEditing(button);
    return;
  }

  if (action === 'add-schedule-item') {
    tripSchedule.addRow(button);
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
