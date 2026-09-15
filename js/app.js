import { createProject } from './presets.js';
import { getState, persistState, replaceState, updateState } from './state.js';
import { downloadJson, escapeHtml } from './utils.js';
import { addExpenseRow, toggleCustomQuantity, updateExpenseRowButtons } from './views/expenseTable.js';
import { readProjectForm, renderProjectPage } from './views/projectView.js';
import { readSchoolForm, renderSchoolPage } from './views/schoolView.js';

const main = document.querySelector('#main');
const projectList = document.querySelector('#projectList');
const addProjectBtn = document.querySelector('#addProjectBtn');
const exportBtn = document.querySelector('#exportBtn');
const importInput = document.querySelector('#importInput');
const message = document.querySelector('#message');
const schoolNav = document.querySelector('[data-page="school"]');

let currentPage = { type: 'school', projectId: null };
let dirty = false;
let messageTimer;

function showMessage(text) {
  message.textContent = text;
  message.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => message.classList.remove('show'), 1800);
}

function renderSidebar() {
  const state = getState();
  schoolNav.classList.toggle('active', currentPage.type === 'school');
  projectList.innerHTML = state.projects.map(project => `
    <button type="button" class="project-item ${currentPage.type === 'project' && currentPage.projectId === project.id ? 'active' : ''}" data-project-id="${escapeHtml(project.id)}">${escapeHtml(project.title)}</button>
  `).join('');
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
    currentPage = { type: 'school', projectId: null };
    render();
    return;
  }

  main.innerHTML = renderProjectPage(project, state.school);
  updateExpenseRowButtons(main.querySelector('#expenseTableBody'));
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

schoolNav.addEventListener('click', () => {
  if (!canDiscardChanges()) return;
  currentPage = { type: 'school', projectId: null };
  render();
});

projectList.addEventListener('click', event => {
  const button = event.target.closest('[data-project-id]');
  if (!button || !canDiscardChanges()) return;
  currentPage = { type: 'project', projectId: button.dataset.projectId };
  render();
});

addProjectBtn.addEventListener('click', () => {
  if (!canDiscardChanges()) return;
  const title = prompt('사업명을 입력하세요.\n예: 2026학년도 2학년 수학여행');
  if (!title?.trim()) return;

  const project = createProject(title.trim());
  updateState(state => { state.projects.push(project); });
  persistState();
  currentPage = { type: 'project', projectId: project.id };
  render();
});

main.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'schoolForm') saveSchool(form);
  if (form.id === 'projectForm') saveProject(form);
});

main.addEventListener('input', () => {
  dirty = true;
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
  const tbody = form?.querySelector('#expenseTableBody');
  const row = button.closest('[data-expense-row]');

  if (action === 'save-headcount' && form) {
    saveProject(form, '인원 정보를 저장했습니다.');
    return;
  }

  if (action === 'save-budget' && form) {
    saveProject(form, '예산 정보를 저장했습니다.');
    return;
  }

  if (action === 'add-expense' && tbody) {
    const project = getState().projects.find(item => item.id === currentPage.projectId);
    if (!project) return;
    addExpenseRow(tbody, project, form.elements.startDate?.value ?? '');
    dirty = true;
    return;
  }

  if (action === 'delete-expense' && row && tbody) {
    row.remove();
    if (!tbody.querySelector('[data-expense-row]')) {
      tbody.innerHTML = '<tr data-empty-row><td colspan="12" class="center">등록된 체험처/비용 항목이 없습니다.</td></tr>';
    }
    updateExpenseRowButtons(tbody);
    dirty = true;
    return;
  }

  if ((action === 'move-expense-up' || action === 'move-expense-down') && row && tbody) {
    const sibling = action === 'move-expense-up' ? row.previousElementSibling : row.nextElementSibling;
    if (sibling?.matches('[data-expense-row]')) {
      if (action === 'move-expense-up') tbody.insertBefore(row, sibling);
      else tbody.insertBefore(sibling, row);
      updateExpenseRowButtons(tbody);
      dirty = true;
    }
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
    currentPage = { type: 'school', projectId: null };
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
    currentPage = { type: 'school', projectId: null };
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
