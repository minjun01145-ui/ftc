import { PROJECT_SECTION, normalizeProjectSection } from './projectSections.js';
import { createProject } from './presets.js';
import { getState, persistState, replaceState, updateState } from './state.js';
import { downloadJson } from './utils.js';
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

function projectPage(projectId, section = PROJECT_SECTION.OVERVIEW) {
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

function saveProject(form, messageText = '저장했습니다.') {
  const state = getState();
  const project = state.projects.find(item => item.id === currentPage.projectId);
  if (!project) return;

  const nextProject = readProjectForm(form, project);
  updateState(next => {
    const index = next.projects.findIndex(item => item.id === currentPage.projectId);
    if (index >= 0) next.projects[index] = nextProject;
  });
  persistState();
  render();
  showMessage(messageText);
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
  const requestedSection = button.dataset.projectSection ?? PROJECT_SECTION.OVERVIEW;
  const nextPage = projectPage(projectId, requestedSection);

  if (currentPage.type === 'project'
      && currentPage.projectId === nextPage.projectId
      && currentPage.section === nextPage.section) return;

  goTo(nextPage);
});

addProjectBtn.addEventListener('click', () => {
  if (!canDiscardChanges()) return;
  const title = prompt('사업명을 입력하세요.\n예: 2026학년도 2학년 수학여행');
  if (!title?.trim()) return;

  const project = createProject(title.trim());
  updateState(state => { state.projects.push(project); });
  persistState();
  currentPage = projectPage(project.id);
  render();
});

main.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'schoolForm') saveSchool(form);
  if (form.id === 'projectForm') saveProject(form);
});

main.addEventListener('input', event => {
  dirty = true;
  const target = event.target;
  if (target.dataset.detailField !== undefined) {
    const editor = target.closest('[data-expense-detail-editor]');
    const tbody = target.closest('tbody');
    if (editor && tbody) syncExpenseDetailAvailability(tbody, editor.dataset.expenseDetailEditor);
  }
});

main.addEventListener('change', event => {
  dirty = true;
  const target = event.target;

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
