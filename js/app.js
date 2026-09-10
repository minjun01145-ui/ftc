import { getState, setState, subscribe, update } from './state.js';
import { createProject } from './presets.js';
import { allocateFunding, calculateExpense, projectCounts, validateProject } from './engine.js';
import { downloadJson, escapeHtml, formatWon, number, uid } from './utils.js';

const main = document.querySelector('#main');
const projectList = document.querySelector('#projectList');
const addProjectBtn = document.querySelector('#addProjectBtn');
const exportBtn = document.querySelector('#exportBtn');
const importInput = document.querySelector('#importInput');
const message = document.querySelector('#message');
const schoolNav = document.querySelector('[data-page="school"]');

let currentPage = { type: 'school', projectId: null };
let messageTimer;

function showMessage(text) {
  message.textContent = text;
  message.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => message.classList.remove('show'), 1800);
}

function money(value) {
  return formatWon(Math.round(number(value)));
}

function renderSidebar() {
  const state = getState();
  schoolNav.classList.toggle('active', currentPage.type === 'school');
  projectList.innerHTML = state.projects.map(project => `
    <button type="button" class="project-item ${currentPage.type === 'project' && currentPage.projectId === project.id ? 'active' : ''}" data-project-id="${project.id}">${escapeHtml(project.title)}</button>
  `).join('');
}

function renderSchool() {
  const s = getState().school;
  const total = number(s.grade1Students) + number(s.grade2Students) + number(s.grade3Students);
  main.innerHTML = `
    <h1>기본정보</h1>
    <fieldset>
      <legend>학교 정보</legend>
      <div class="form-grid">
        <label for="schoolName">학교명</label>
        <input id="schoolName" type="text" data-school="name" value="${escapeHtml(s.name)}">
        <label for="homepage">학교 홈페이지</label>
        <input id="homepage" type="url" data-school="homepage" value="${escapeHtml(s.homepage)}">

        <label for="schoolYear">학년도</label>
        <input id="schoolYear" type="number" data-school-number="schoolYear" value="${number(s.schoolYear)}">
        <span></span><span></span>

        <label for="grade1Students">1학년 학생수</label>
        <input id="grade1Students" type="number" min="0" data-school-number="grade1Students" value="${number(s.grade1Students)}">
        <label for="grade2Students">2학년 학생수</label>
        <input id="grade2Students" type="number" min="0" data-school-number="grade2Students" value="${number(s.grade2Students)}">

        <label for="grade3Students">3학년 학생수</label>
        <input id="grade3Students" type="number" min="0" data-school-number="grade3Students" value="${number(s.grade3Students)}">
        <label>전체 학생수</label>
        <input readonly value="${total}">
      </div>
    </fieldset>
    <p class="help">학교알리미 자동 조회는 추후 이 화면에 연결합니다. 현재 버전은 직접 입력합니다.</p>
  `;
}

function expenseMethodOptions(selected) {
  const options = [
    ['perPerson', '1인당 금액'],
    ['fixedStudent', '학생 총액'],
    ['sharedFixed', '학생+인솔자 총액 분담']
  ];
  return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function quantityOptions(selected) {
  const options = [
    ['participants', '실제 참가학생'],
    ['participantsPlusAbsent', '참가학생+불참자'],
    ['totalStudents', '총학생수'],
    ['custom', '직접 입력']
  ];
  return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderExpenseRows(project, settlement = false) {
  if (!project.expenses.length) {
    return `<tr><td colspan="12" class="center">등록된 체험처/비용 항목이 없습니다.</td></tr>`;
  }
  return project.expenses.map((expense, index) => {
    const calc = calculateExpense(expense, project, settlement);
    const planCalc = calculateExpense(expense, project, false);
    const baseValue = expense.calcMethod === 'perPerson' ? expense.unitAmount : expense.planAmount;
    const baseLabel = expense.calcMethod === 'perPerson' ? '단가' : '총액';
    return `
      <tr>
        <td class="center">
          <button type="button" class="small-button" data-action="move-expense-up" data-id="${expense.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="small-button" data-action="move-expense-down" data-id="${expense.id}" ${index === project.expenses.length - 1 ? 'disabled' : ''}>↓</button>
        </td>
        <td><input type="date" data-expense="date" data-id="${expense.id}" value="${escapeHtml(expense.date ?? '')}"></td>
        <td><input type="text" data-expense="name" data-id="${expense.id}" value="${escapeHtml(expense.name)}"></td>
        <td><select data-expense="calcMethod" data-id="${expense.id}">${expenseMethodOptions(expense.calcMethod)}</select></td>
        <td><select data-expense="quantityBase" data-id="${expense.id}">${quantityOptions(expense.quantityBase)}</select></td>
        <td>${expense.quantityBase === 'custom'
          ? `<input type="number" min="0" data-expense-number="customQuantity" data-id="${expense.id}" value="${number(expense.customQuantity)}">`
          : `<input readonly value="${calc.studentQty}">`}
        </td>
        <td><input type="number" min="0" title="${baseLabel}" data-expense-number="${expense.calcMethod === 'perPerson' ? 'unitAmount' : 'planAmount'}" data-id="${expense.id}" value="${number(baseValue)}"></td>
        <td class="number">${money(planCalc.studentTotal)}</td>
        <td class="number">${money(planCalc.staffTotal)}</td>
        <td><input type="number" min="0" placeholder="계획과 같으면 비움" data-expense-null-number="actualAmount" data-id="${expense.id}" value="${expense.actualAmount ?? ''}"></td>
        <td class="number">${money(calculateExpense(expense, project, true).studentTotal)}</td>
        <td class="center"><button type="button" class="small-button danger" data-action="delete-expense" data-id="${expense.id}">삭제</button></td>
      </tr>`;
  }).join('');
}

function renderAllocationTable(project, settlement) {
  const allocation = allocateFunding(project, settlement);
  const rows = allocation.allocations.map(row => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td class="number">${money(row.studentTotal)}</td>
      <td class="number">${money(row.education)}</td>
      <td class="number">${money(row.school)}</td>
      <td class="number">${money(row.student)}</td>
    </tr>`).join('');
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>항목</th><th>학생경비</th><th>교육청 지원금</th><th>학교 자체지원금</th><th>학생부담금</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="center">비용 항목이 없습니다.</td></tr>'}</tbody>
      </table>
    </div>`;
}

function renderSummaryTable(project, settlement) {
  const allocation = allocateFunding(project, settlement);
  const label = settlement ? '정산' : '계획';
  return `
    <div class="table-wrap">
      <table class="summary-table">
        <tbody>
          <tr><th>${label} 학생경비 합계</th><td>${money(allocation.expenses.studentTotal)}</td></tr>
          <tr><th>${label} 인솔자경비 합계</th><td>${money(allocation.expenses.staffTotal)}</td></tr>
          <tr class="total"><th>${label} 전체 비용</th><td>${money(allocation.expenses.total)}</td></tr>
          <tr><th>교육청 지원금 사용액</th><td>${money(allocation.educationUsed)}</td></tr>
          <tr><th>교육청 지원금 잔액</th><td>${allocation.educationBalance === null ? '교부액 미입력' : money(allocation.educationBalance)}</td></tr>
          <tr><th>학교 자체지원금 사용액</th><td>${money(allocation.schoolUsed)}</td></tr>
          <tr><th>학교 자체지원금 잔액</th><td>${money(allocation.schoolBalance)}</td></tr>
          <tr><th>학생부담금 합계</th><td>${money(allocation.studentUsed)}</td></tr>
          <tr class="total"><th>비취약 참가학생 1인당 부담액</th><td>${money(allocation.regularPersonalBurden)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

function renderValidation(project) {
  const validation = validateProject(project, false);
  if (!validation.issues.length) return `<div class="status-box"><span class="ok-text">입력값 검증: 이상 없음</span></div>`;
  return `<div class="status-box"><span class="error-text">확인할 항목이 있습니다.</span><ul>${validation.issues.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`;
}

function renderProject(project) {
  const c = projectCounts(project);
  const school = getState().school;
  main.innerHTML = `
    <h1>${escapeHtml(project.title)}</h1>

    <fieldset>
      <legend>사업정보</legend>
      <div class="form-grid">
        <label>사업명</label>
        <input type="text" data-project="title" value="${escapeHtml(project.title)}">
        <label>학교명</label>
        <input readonly value="${escapeHtml(school.name)}">

        <label>시작일</label>
        <input type="date" data-project="startDate" value="${escapeHtml(project.startDate)}">
        <label>종료일</label>
        <input type="date" data-project="endDate" value="${escapeHtml(project.endDate)}">
      </div>
    </fieldset>

    <fieldset>
      <legend>인원 및 지원기준</legend>
      <div class="form-grid">
        <label>총학생수</label>
        <input type="number" min="0" data-project-number="totalStudents" value="${number(project.totalStudents)}">
        <label>실제 참가학생수</label>
        <input type="number" min="0" data-project-number="actualParticipants" value="${number(project.actualParticipants)}">

        <label>불참자수</label>
        <input type="number" min="0" data-project-number="absentStudents" value="${number(project.absentStudents)}">
        <label>인솔자수</label>
        <input type="number" min="0" data-project-number="chaperones" value="${number(project.chaperones)}">

        <label>취약계층 참가학생수</label>
        <input type="number" min="0" data-project-number="vulnerableParticipants" value="${number(project.vulnerableParticipants)}">
        <label>취약계층 불참자수</label>
        <input type="number" min="0" data-project-number="vulnerableAbsent" value="${number(project.vulnerableAbsent)}">

        <label>비취약 참가학생수</label>
        <input readonly value="${c.regularParticipants}">
        <label>비취약 불참자수</label>
        <input readonly value="${c.regularAbsent}">

        <label>교육청 지원금(비취약 1인당)</label>
        <input type="number" min="0" data-support-number="regularPerPerson" value="${number(project.educationSupport.regularPerPerson)}">
        <label>교육청 실제 교부액</label>
        <input type="number" min="0" placeholder="정산용, 선택 입력" data-support-null-number="grantTotal" value="${project.educationSupport.grantTotal ?? ''}">

        <label>교육청 지원금(취약계층)</label>
        <select data-support="vulnerableMode">
          <option value="full" ${project.educationSupport.vulnerableMode === 'full' ? 'selected' : ''}>실비 전액</option>
          <option value="perPerson" ${project.educationSupport.vulnerableMode === 'perPerson' ? 'selected' : ''}>1인당 정액</option>
        </select>
        <label>취약계층 1인당 지원액</label>
        <input type="number" min="0" data-support-number="vulnerablePerPerson" value="${number(project.educationSupport.vulnerablePerPerson)}" ${project.educationSupport.vulnerableMode === 'full' ? 'disabled' : ''}>

        <label>학교 자체지원금 방식</label>
        <select data-school-support="mode">
          <option value="total" ${project.schoolSupport.mode === 'total' ? 'selected' : ''}>총액</option>
          <option value="perPersonRegular" ${project.schoolSupport.mode === 'perPersonRegular' ? 'selected' : ''}>비취약 참가학생 1인당</option>
        </select>
        <label>학교 자체지원금</label>
        <input type="number" min="0" data-school-support-number="amount" value="${number(project.schoolSupport.amount)}">
      </div>
      <p class="help">교육청 지원금과 학교 자체지원금은 아래 체험처/비용 항목의 위쪽부터 순서대로 자동 배분합니다.</p>
    </fieldset>

    ${renderValidation(project)}

    <h2>체험처/비용</h2>
    <div class="toolbar">
      <button type="button" data-action="add-expense">항목 추가</button>
      <span class="help">행 순서가 동선 순서이면서 지원금 자동 배분 순서입니다.</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>순서</th><th>일자</th><th>체험처/항목</th><th>계산방법</th><th>대상인원</th><th>수량</th><th>단가/총액</th>
            <th>학생 계획액</th><th>인솔자 계획액</th><th>실제 지출액</th><th>학생 정산액</th><th></th>
          </tr>
        </thead>
        <tbody>${renderExpenseRows(project)}</tbody>
      </table>
    </div>

    <h2>계획 계산</h2>
    ${renderSummaryTable(project, false)}
    <h2>계획 재원 배분</h2>
    ${renderAllocationTable(project, false)}

    <h2>정산</h2>
    <p class="help">위 비용표의 ‘실제 지출액’을 입력하면 정산 금액이 자동으로 다시 계산됩니다. 비워두면 계획 금액을 그대로 사용합니다.</p>
    ${renderSummaryTable(project, true)}
    <h2>정산 재원 배분</h2>
    ${renderAllocationTable(project, true)}

    <fieldset>
      <legend>메모</legend>
      <textarea data-project="memo">${escapeHtml(project.memo)}</textarea>
    </fieldset>

    <div class="page-actions">
      <button type="button" onclick="window.print()">인쇄</button>
      <button type="button" class="danger" data-action="delete-project">이 사업 삭제</button>
    </div>
  `;
}

function captureFocus() {
  const active = document.activeElement;
  if (!active || !main.contains(active)) return null;
  const keys = ['school', 'schoolNumber', 'project', 'projectNumber', 'supportNumber', 'supportNullNumber', 'support', 'schoolSupport', 'schoolSupportNumber', 'expense', 'expenseNumber', 'expenseNullNumber'];
  const key = keys.find(k => active.dataset?.[k] !== undefined);
  if (!key) return null;
  return {
    key, value: active.dataset[key], id: active.dataset.id ?? '',
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
  };
}

function restoreFocus(info) {
  if (!info) return;
  const candidates = [...main.querySelectorAll('input, select, textarea')];
  const target = candidates.find(el => el.dataset?.[info.key] === info.value && (info.id === '' || el.dataset?.id === info.id));
  if (!target) return;
  target.focus({ preventScroll: true });
  if (info.start !== null && typeof target.setSelectionRange === 'function') {
    try { target.setSelectionRange(info.start, info.end); } catch {}
  }
}

function render() {
  const focus = captureFocus();
  renderSidebar();
  const state = getState();
  if (currentPage.type === 'school') {
    renderSchool();
    restoreFocus(focus);
    return;
  }
  const project = state.projects.find(p => p.id === currentPage.projectId);
  if (!project) {
    currentPage = { type: 'school', projectId: null };
    renderSidebar();
    renderSchool();
    return;
  }
  renderProject(project);
  restoreFocus(focus);
}

function currentProjectMutator(mutator) {
  update(state => {
    const project = state.projects.find(p => p.id === currentPage.projectId);
    if (project) mutator(project);
  });
}

schoolNav.addEventListener('click', () => {
  currentPage = { type: 'school', projectId: null };
  render();
});

projectList.addEventListener('click', event => {
  const button = event.target.closest('[data-project-id]');
  if (!button) return;
  currentPage = { type: 'project', projectId: button.dataset.projectId };
  render();
});

addProjectBtn.addEventListener('click', () => {
  const title = prompt('사업명을 입력하세요.\n예: 2026학년도 2학년 수학여행');
  if (!title?.trim()) return;
  const project = createProject(title.trim());
  update(state => state.projects.push(project));
  currentPage = { type: 'project', projectId: project.id };
  render();
});

main.addEventListener('input', event => {
  const t = event.target;
  if (t.dataset.school) update(state => state.school[t.dataset.school] = t.value);
  if (t.dataset.schoolNumber) update(state => state.school[t.dataset.schoolNumber] = Math.max(0, number(t.value)));

  if (t.dataset.project) currentProjectMutator(project => project[t.dataset.project] = t.value);
  if (t.dataset.projectNumber) currentProjectMutator(project => project[t.dataset.projectNumber] = Math.max(0, number(t.value)));
  if (t.dataset.supportNumber) currentProjectMutator(project => project.educationSupport[t.dataset.supportNumber] = Math.max(0, number(t.value)));
  if (t.dataset.supportNullNumber) currentProjectMutator(project => project.educationSupport[t.dataset.supportNullNumber] = t.value === '' ? null : Math.max(0, number(t.value)));
  if (t.dataset.schoolSupportNumber) currentProjectMutator(project => project.schoolSupport[t.dataset.schoolSupportNumber] = Math.max(0, number(t.value)));

  if (t.dataset.expense) currentProjectMutator(project => {
    const expense = project.expenses.find(e => e.id === t.dataset.id);
    if (expense) expense[t.dataset.expense] = t.value;
  });
  if (t.dataset.expenseNumber) currentProjectMutator(project => {
    const expense = project.expenses.find(e => e.id === t.dataset.id);
    if (expense) expense[t.dataset.expenseNumber] = Math.max(0, number(t.value));
  });
  if (t.dataset.expenseNullNumber) currentProjectMutator(project => {
    const expense = project.expenses.find(e => e.id === t.dataset.id);
    if (expense) expense[t.dataset.expenseNullNumber] = t.value === '' ? null : Math.max(0, number(t.value));
  });
});

main.addEventListener('change', event => {
  const t = event.target;
  if (t.dataset.support) currentProjectMutator(project => project.educationSupport[t.dataset.support] = t.value);
  if (t.dataset.schoolSupport) currentProjectMutator(project => project.schoolSupport[t.dataset.schoolSupport] = t.value);
});

main.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'add-expense') {
    currentProjectMutator(project => project.expenses.push({
      id: uid('expense'), date: project.startDate || '', name: '', calcMethod: 'perPerson', quantityBase: 'participants',
      customQuantity: 0, unitAmount: 0, planAmount: 0, actualAmount: null, rounding: 'floor10', note: ''
    }));
  }
  if (action === 'delete-expense') {
    currentProjectMutator(project => project.expenses = project.expenses.filter(e => e.id !== id));
  }
  if (action === 'move-expense-up' || action === 'move-expense-down') {
    currentProjectMutator(project => {
      const index = project.expenses.findIndex(e => e.id === id);
      const target = action.endsWith('up') ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= project.expenses.length) return;
      [project.expenses[index], project.expenses[target]] = [project.expenses[target], project.expenses[index]];
    });
  }
  if (action === 'delete-project') {
    const project = getState().projects.find(p => p.id === currentPage.projectId);
    if (!project || !confirm(`'${project.title}' 사업을 삭제할까요?`)) return;
    update(state => state.projects = state.projects.filter(p => p.id !== currentPage.projectId));
    currentPage = { type: 'school', projectId: null };
    render();
  }
});

exportBtn.addEventListener('click', () => {
  const state = getState();
  const schoolName = state.school.name || '학교';
  downloadJson(`${schoolName}_현장체험학습_자료.json`.replace(/[\\/:*?"<>|]/g, '_'), state);
  showMessage('저장 파일을 만들었습니다.');
});

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed?.school || !Array.isArray(parsed?.projects)) throw new Error('형식 오류');
    setState(parsed);
    currentPage = { type: 'school', projectId: null };
    showMessage('저장 파일을 불러왔습니다.');
  } catch {
    showMessage('올바른 저장 파일이 아닙니다.');
  } finally {
    importInput.value = '';
  }
});

subscribe(render);
render();
