import { getState, update, resetState, setState, subscribe } from './state.js';
import { summarize, calculateExpense } from './engine.js';
import { cohortLabels } from './presets.js';
import { formatWon, escapeHtml, uid, downloadJson, number } from './utils.js';

const app = document.querySelector('#app');
const tabs = document.querySelectorAll('.tab');
const exportBtn = document.querySelector('#exportBtn');
const importInput = document.querySelector('#importInput');
const resetBtn = document.querySelector('#resetBtn');
const printBtn = document.querySelector('#printBtn');
const toastEl = document.querySelector('#toast');

let activeTab = 'overview';
let toastTimer;

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function safeValue(v) { return v ?? ''; }
function numericValue(v) { return v === null || v === undefined ? '' : v; }

function participantScopeLabel(scope) {
  return scope === 'fixedStudents' ? '참가 + 취소불가 고정비 학생' : '실제 참가학생';
}

function calcModeLabel(mode) {
  return {
    perPerson: '학생 1인당',
    sharedFixed: '총액 공동분담',
    staffPerPerson: '인솔자 1인당',
    staffFixed: '인솔자 총액'
  }[mode] ?? mode;
}

function ruleKindLabel(kind) {
  return { fullCost: '실비 전액', perCapita: '1인당 정액', fixed: '총액 정액', residual: '잔액 부담' }[kind] ?? kind;
}

function renderMetrics(summary) {
  return `
    <div class="metrics">
      <div class="metric"><div class="label">실제 참가학생</div><div class="value">${summary.counts.actualStudents.toLocaleString()}명</div><div class="sub">비취약 ${summary.counts.regular} · 취약 ${summary.counts.vulnerable}</div></div>
      <div class="metric"><div class="label">고정비 대상학생</div><div class="value">${summary.counts.fixedStudents.toLocaleString()}명</div><div class="sub">불참이지만 취소불가 비용 발생 ${summary.counts.absentFixed}명</div></div>
      <div class="metric"><div class="label">계획 학생경비</div><div class="value">${formatWon(summary.allocation.expensesResult.studentTotal)}</div><div class="sub">인솔자 비용과 분리하여 재원 배분</div></div>
      <div class="metric"><div class="label">비취약 1인 실부담</div><div class="value">${formatWon(summary.personalBurden)}</div><div class="sub">수익자부담 재원의 자동 잔액 배분 결과</div></div>
    </div>`;
}

function renderOverview(project, summary) {
  const p = project.participants;
  return `
  <section class="section ${activeTab === 'overview' ? 'active' : ''}" data-section="overview">
    ${renderMetrics(summary)}
    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><div><h2>사업 기본정보</h2><p>학교알리미 연동 전까지는 직접 입력합니다.</p></div></div>
        <div class="grid cols-2">
          <div class="field"><label>학교명</label><input data-meta="schoolName" value="${escapeHtml(project.meta.schoolName)}" placeholder="예: ○○중학교"></div>
          <div class="field"><label>학교 홈페이지</label><input data-meta="schoolUrl" value="${escapeHtml(project.meta.schoolUrl)}" placeholder="https://..."></div>
          <div class="field"><label>학년도</label><input type="number" data-meta-number="schoolYear" value="${project.meta.schoolYear}"></div>
          <div class="field"><label>학년</label><input type="number" data-meta-number="grade" min="1" max="6" value="${project.meta.grade}"></div>
          <div class="field" style="grid-column:1/-1"><label>사업명</label><input data-meta="title" value="${escapeHtml(project.meta.title)}"></div>
          <div class="field" style="grid-column:1/-1"><label>메모</label><textarea data-meta="memo">${escapeHtml(project.meta.memo)}</textarea></div>
        </div>
        <div class="callout info spaced">학교알리미 API 연동 모듈은 <strong>js/services/schoolInfo.js</strong>에 분리해 두었습니다. 인증키를 프런트에 노출하지 않도록 서버리스 프록시를 붙이는 것을 전제로 합니다.</div>
      </div>

      <div class="card">
        <div class="card-head"><div><h2>학생·인솔자 구성</h2><p>비용이 달라지는 집단을 분리합니다. 참가자 한 명이 바뀌면 전체 계산이 즉시 다시 됩니다.</p></div></div>
        <div class="grid cols-2">
          <div class="field"><label>비취약 참가학생</label><input type="number" min="0" data-participant="regular" value="${p.regular}"></div>
          <div class="field"><label>취약계층 참가학생</label><input type="number" min="0" data-participant="vulnerable" value="${p.vulnerable}"></div>
          <div class="field"><label>비취약 불참 · 고정비 발생</label><input type="number" min="0" data-participant="absentRegular" value="${p.absentRegular}"></div>
          <div class="field"><label>취약계층 불참 · 고정비 발생</label><input type="number" min="0" data-participant="absentVulnerable" value="${p.absentVulnerable}"></div>
          <div class="field"><label>인솔자</label><input type="number" min="0" data-participant="chaperones" value="${p.chaperones}"></div>
          <div class="field"><label>자동 계산</label><input class="readonly" readonly value="참가 ${summary.counts.actualStudents}명 / 고정비 ${summary.counts.fixedStudents}명"></div>
        </div>
      </div>
    </div>

    <div class="card spaced">
      <div class="card-head"><div><h2>현재 계산 흐름</h2><p>이 MVP가 자동으로 연결하는 단계입니다.</p></div></div>
      <div class="grid cols-4">
        <div class="callout info"><strong>1. 인원</strong><br>참가/취약/불참 고정비/인솔자</div>
        <div class="callout info"><strong>2. 비용</strong><br>1인당 또는 총액 분담 방식</div>
        <div class="callout info"><strong>3. 재원</strong><br>지원 규칙별 자동 배분</div>
        <div class="callout info"><strong>4. 정산</strong><br>실집행액·잔액·오류 검증</div>
      </div>
    </div>
  </section>`;
}

function expenseInputCell(exp, result) {
  if (exp.calcMode === 'sharedFixed' || exp.calcMode === 'staffFixed') {
    return `<input type="number" min="0" data-expense-field="contractTotal" data-id="${exp.id}" value="${numericValue(exp.contractTotal)}">${exp.calcMode === 'sharedFixed' ? `<select data-expense-field="rounding" data-id="${exp.id}" style="margin-top:5px"><option value="floor10" ${(exp.rounding ?? 'floor10')==='floor10'?'selected':''}>학생단가 10원 미만 절사</option><option value="floor1" ${exp.rounding==='floor1'?'selected':''}>학생단가 원 미만 절사</option><option value="round10" ${exp.rounding==='round10'?'selected':''}>학생단가 10원 단위 반올림</option><option value="round1" ${exp.rounding==='round1'?'selected':''}>학생단가 원 단위 반올림</option></select>` : ''}`;
  }
  return `<input type="number" min="0" data-expense-field="unitAmount" data-id="${exp.id}" value="${numericValue(exp.unitAmount)}">`;
}

function actualExpenseInputCell(exp) {
  if (exp.calcMode === 'sharedFixed' || exp.calcMode === 'staffFixed') {
    return `<input type="number" min="0" data-expense-null-number="actualContractTotal" data-id="${exp.id}" value="${numericValue(exp.actualContractTotal)}" placeholder="계획과 동일">`;
  }
  return `<input type="number" min="0" data-expense-null-number="actualUnitAmount" data-id="${exp.id}" value="${numericValue(exp.actualUnitAmount)}" placeholder="계획과 동일">`;
}

function renderExpenses(project) {
  const planSummary = summarize(project, false);
  const settlementSummary = summarize(project, true);
  return `
  <section class="section ${activeTab === 'expenses' ? 'active' : ''}" data-section="expenses">
    <div class="card">
      <div class="card-head">
        <div><h2>프로그램·비용 항목</h2><p>표의 순서는 재원 자동배분 우선순위로도 사용됩니다. ↑↓ 버튼으로 순서를 바꿀 수 있습니다.</p></div>
        <button class="button" data-action="add-expense">+ 비용 항목</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th style="width:38px">순서</th><th>항목</th><th>계산방식</th><th>적용범위</th><th>계획 기준값</th><th class="money">학생 계획액</th><th class="money">인솔자 계획액</th><th>정산 기준값</th><th class="money">학생 실집행액</th><th></th></tr></thead>
        <tbody>
          ${project.expenses.map((exp, index) => {
            const plan = calculateExpense(exp, project, false);
            const actual = calculateExpense(exp, project, true);
            return `<tr>
              <td><div class="inline-actions"><button class="button secondary small" data-action="move-expense-up" data-id="${exp.id}" ${index===0?'disabled':''}>↑</button><button class="button secondary small" data-action="move-expense-down" data-id="${exp.id}" ${index===project.expenses.length-1?'disabled':''}>↓</button></div></td>
              <td><input data-expense-field="name" data-id="${exp.id}" value="${escapeHtml(exp.name)}"><div class="row-note"><input data-expense-field="note" data-id="${exp.id}" value="${escapeHtml(exp.note ?? '')}" placeholder="메모"></div></td>
              <td><select data-expense-field="calcMode" data-id="${exp.id}">
                ${['perPerson','sharedFixed','staffPerPerson','staffFixed'].map(v=>`<option value="${v}" ${exp.calcMode===v?'selected':''}>${calcModeLabel(v)}</option>`).join('')}
              </select></td>
              <td>${exp.calcMode === 'perPerson' || exp.calcMode === 'sharedFixed' ? `<select data-expense-field="scope" data-id="${exp.id}"><option value="participants" ${exp.scope==='participants'?'selected':''}>실제 참가학생</option><option value="fixedStudents" ${exp.scope==='fixedStudents'?'selected':''}>참가+고정비 학생</option></select>` : '<span class="muted">인솔자</span>'}</td>
              <td>${expenseInputCell(exp, plan)}${exp.calcMode==='sharedFixed'?`<div class="row-note">학생단가 ${formatWon(plan.unit)} · ${escapeHtml(participantScopeLabel(exp.scope))} + 인솔자 ${planSummary.counts.chaperones}명</div>`:''}</td>
              <td class="money strong">${formatWon(plan.studentTotal)}</td>
              <td class="money">${formatWon(plan.staffTotal)}</td>
              <td>${actualExpenseInputCell(exp)}</td>
              <td class="money strong">${formatWon(actual.studentTotal)}</td>
              <td><button class="button danger ghost small" data-action="delete-expense" data-id="${exp.id}">삭제</button></td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr><th colspan="5">합계</th><th class="money">${formatWon(planSummary.allocation.expensesResult.studentTotal)}</th><th class="money">${formatWon(planSummary.allocation.expensesResult.staffTotal)}</th><th></th><th class="money">${formatWon(settlementSummary.allocation.expensesResult.studentTotal)}</th><th></th></tr></tfoot>
      </table></div>
      <div class="help spaced">※ “총액 공동분담”은 총 계약액 ÷ (고정비 대상학생 + 인솔자)로 학생 1인 단가를 계산하고, 기본값은 10원 미만 절사입니다. 남은 금액은 인솔자 몫으로 자동 처리합니다.</div>
    </div>
  </section>`;
}

function renderAccountTable(project, summary, settlement = false) {
  const result = settlement ? summarize(project, true) : summary;
  return `<div class="table-wrap"><table>
    <thead><tr><th>재원 계정</th><th>구분</th><th>교부/예산액</th><th class="money">자동 배분액</th><th class="money">잔액</th><th></th></tr></thead>
    <tbody>${project.fundAccounts.map(account => {
      const calc = result.allocation.accountResults.find(a => a.id === account.id);
      return `<tr>
        <td><input data-account-field="name" data-id="${account.id}" value="${escapeHtml(account.name)}"></td>
        <td><select data-account-field="type" data-id="${account.id}"><option value="subsidy" ${account.type==='subsidy'?'selected':''}>교육청/목적사업</option><option value="school" ${account.type==='school'?'selected':''}>학교예산</option><option value="student" ${account.type==='student'?'selected':''}>수익자부담</option></select></td>
        <td><input type="number" min="0" data-account-null-number="budgetAmount" data-id="${account.id}" value="${numericValue(account.budgetAmount)}" placeholder="선택 입력"></td>
        <td class="money strong">${formatWon(calc?.used ?? 0)}</td>
        <td class="money">${calc?.balance === null ? '-' : formatWon(calc.balance)}</td>
        <td><button class="button danger ghost small" data-action="delete-account" data-id="${account.id}">삭제</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function ruleTargetCheckboxes(rule) {
  return Object.entries(cohortLabels).map(([key,label]) => `<label class="check"><input type="checkbox" data-rule-cohort="${key}" data-id="${rule.id}" ${rule.targetCohorts.includes(key)?'checked':''}>${label}</label>`).join('');
}

function ruleExpenseCheckboxes(rule, project) {
  return project.expenses.map(exp => `<label class="check"><input type="checkbox" data-rule-expense="${exp.id}" data-id="${rule.id}" ${rule.eligibleExpenseIds.includes(exp.id)?'checked':''}>${escapeHtml(exp.name)}</label>`).join('');
}

function renderRules(project, summary) {
  return project.fundingRules.map((rule, index) => {
    const calc = summary.allocation.allocations.find(a => a.rule.id === rule.id);
    return `<div class="rule-card">
      <div class="rule-grid">
        <div class="field"><label>규칙명</label><input data-rule-field="name" data-id="${rule.id}" value="${escapeHtml(rule.name)}"></div>
        <div class="field"><label>재원 계정</label><select data-rule-field="accountId" data-id="${rule.id}">${project.fundAccounts.map(a=>`<option value="${a.id}" ${rule.accountId===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>지원 방식</label><select data-rule-field="kind" data-id="${rule.id}">${['fullCost','perCapita','fixed','residual'].map(v=>`<option value="${v}" ${rule.kind===v?'selected':''}>${ruleKindLabel(v)}</option>`).join('')}</select></div>
        <div class="field"><label>${rule.kind==='perCapita'?'1인당 금액':rule.kind==='fixed'?'총액':'규칙 한도'}</label>${rule.kind==='perCapita'||rule.kind==='fixed'?`<input type="number" min="0" data-rule-number="unitAmount" data-id="${rule.id}" value="${number(rule.unitAmount)}">`:`<input class="readonly" readonly value="${rule.kind==='residual'?'잔액 자동':'실비 자동'}">`}</div>
      </div>
      <details>
        <summary>대상 학생 · 적용 비용 설정</summary>
        <div class="mini-label" style="margin-top:10px">대상 학생 집단</div><div class="check-grid">${ruleTargetCheckboxes(rule)}</div>
        <div class="mini-label" style="margin-top:12px">이 규칙으로 결제할 수 있는 비용 항목</div><div class="check-grid">${ruleExpenseCheckboxes(rule, project)}</div>
      </details>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:10px">
        <div class="help">규칙상 금액 ${formatWon(calc?.nominalBudget ?? 0)} · 실제 배분 ${formatWon(calc?.used ?? 0)}</div>
        <div class="inline-actions"><button class="button secondary small" data-action="move-rule-up" data-id="${rule.id}" ${index===0?'disabled':''}>↑</button><button class="button secondary small" data-action="move-rule-down" data-id="${rule.id}" ${index===project.fundingRules.length-1?'disabled':''}>↓</button><button class="button danger ghost small" data-action="delete-rule" data-id="${rule.id}">삭제</button></div>
      </div>
    </div>`;
  }).join('');
}

function renderAllocations(summary) {
  return summary.allocation.allocations.map(a => `
    <div class="allocation-group">
      <div class="allocation-head"><div><strong>${escapeHtml(a.rule.name)}</strong><div class="help">${ruleKindLabel(a.rule.kind)}</div></div><strong>${formatWon(a.used)}</strong></div>
      <div class="allocation-body">
        ${a.lines.length ? a.lines.map(line=>`<div class="allocation-line"><span>${escapeHtml(line.expenseName)} <span class="muted">· ${escapeHtml(cohortLabels[line.cohort] ?? line.cohort)}</span></span><strong>${formatWon(line.amount)}</strong></div>`).join('') : '<div class="muted">배분된 금액이 없습니다.</div>'}
      </div>
    </div>`).join('');
}

function renderFunding(project, summary) {
  return `
  <section class="section ${activeTab === 'funding' ? 'active' : ''}" data-section="funding">
    ${renderMetrics(summary)}
    <div class="card">
      <div class="card-head"><div><h2>재원 계정</h2><p>교부금·학교예산·수익자부담을 계정 단위로 관리합니다.</p></div><button class="button" data-action="add-account">+ 재원 계정</button></div>
      ${renderAccountTable(project, summary)}
    </div>
    <div class="grid cols-2 spaced">
      <div class="card">
        <div class="card-head"><div><h2>지원·부담 규칙</h2><p>위에서 아래 순서대로 비용을 배분합니다. 목적예산을 먼저 두고 수익자부담을 마지막에 두는 방식이 안전합니다.</p></div><button class="button" data-action="add-rule">+ 규칙</button></div>
        ${renderRules(project, summary)}
      </div>
      <div class="card">
        <div class="card-head"><div><h2>자동 품의 배분 결과</h2><p>각 재원이 실제로 어떤 비용 항목을 얼마씩 담당하는지 보여줍니다.</p></div></div>
        ${renderAllocations(summary)}
      </div>
    </div>
  </section>`;
}

function renderValidation(summary) {
  return summary.issues.map(i => `<div class="callout ${i.level}">${i.level==='ok'?'✓ ':i.level==='error'?'⚠ ':i.level==='warning'?'△ ':'ℹ '}${escapeHtml(i.message)}</div>`).join('');
}

function renderSettlement(project) {
  const plan = summarize(project, false);
  const actual = summarize(project, true);
  const planStudent = plan.allocation.accountResults.find(a => a.type==='student')?.used ?? 0;
  const actualStudent = actual.allocation.accountResults.find(a => a.type==='student')?.used ?? 0;
  return `
  <section class="section ${activeTab === 'settlement' ? 'active' : ''}" data-section="settlement">
    <div class="metrics">
      <div class="metric"><div class="label">계획 학생경비</div><div class="value">${formatWon(plan.allocation.expensesResult.studentTotal)}</div><div class="sub">산출 단계</div></div>
      <div class="metric"><div class="label">실제 학생경비</div><div class="value">${formatWon(actual.allocation.expensesResult.studentTotal)}</div><div class="sub">비용표의 정산 기준값 반영</div></div>
      <div class="metric"><div class="label">계획 수익자부담</div><div class="value">${formatWon(planStudent)}</div><div class="sub">1인 ${formatWon(plan.personalBurden)}</div></div>
      <div class="metric"><div class="label">정산 수익자부담</div><div class="value">${formatWon(actualStudent)}</div><div class="sub">1인 ${formatWon(actual.personalBurden)}</div></div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><div><h2>정산 재원별 집행·잔액</h2><p>비용산출 화면의 ‘정산 기준값’을 입력하면 자동으로 재계산됩니다.</p></div></div>
        ${renderAccountTable(project, actual, true)}
      </div>
      <div class="card">
        <div class="card-head"><div><h2>자동 검증</h2><p>교부액 초과, 미배분 금액, 1인 부담액 나눗셈 오류 등을 확인합니다.</p></div></div>
        ${renderValidation(actual)}
      </div>
    </div>

    <div class="card spaced">
      <div class="card-head"><div><h2>정산 배분 상세</h2><p>실집행 기준으로 다시 계산한 재원별 비용 구성입니다.</p></div></div>
      <div class="grid cols-2">${actual.allocation.allocations.map(a=>`<div>${renderAllocations({allocation:{allocations:[a]}})}</div>`).join('')}</div>
    </div>
  </section>`;
}

function render() {
  // 전체 화면을 다시 그려도 현재 입력 포커스/커서가 유지되도록 복원한다.
  const active = document.activeElement;
  const datasetKeys = ['meta','metaNumber','participant','expenseField','expenseNullNumber','accountField','accountNullNumber','ruleField','ruleNumber'];
  const focusInfo = active && app.contains(active) ? {
    key: datasetKeys.find(key => active.dataset?.[key] !== undefined),
    value: datasetKeys.find(key => active.dataset?.[key] !== undefined) ? active.dataset[datasetKeys.find(key => active.dataset?.[key] !== undefined)] : null,
    id: active.dataset?.id ?? null,
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
  } : null;

  const project = getState();
  const summary = summarize(project, false);
  app.innerHTML = [renderOverview(project, summary), renderExpenses(project), renderFunding(project, summary), renderSettlement(project)].join('');
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === activeTab));

  if (focusInfo?.key) {
    const candidates = [...app.querySelectorAll('input,select,textarea')];
    const restored = candidates.find(el => el.dataset?.[focusInfo.key] === focusInfo.value && (focusInfo.id === null || el.dataset?.id === focusInfo.id));
    if (restored) {
      restored.focus({ preventScroll: true });
      if (focusInfo.start !== null && typeof restored.setSelectionRange === 'function') {
        try { restored.setSelectionRange(focusInfo.start, focusInfo.end); } catch {}
      }
    }
  }
}

function updateExpense(id, field, value) {
  update(project => {
    const exp = project.expenses.find(e => e.id === id);
    if (!exp) return;
    exp[field] = value;
  });
}
function updateAccount(id, field, value) {
  update(project => {
    const account = project.fundAccounts.find(a => a.id === id);
    if (account) account[field] = value;
  });
}
function updateRule(id, field, value) {
  update(project => {
    const rule = project.fundingRules.find(r => r.id === id);
    if (rule) rule[field] = value;
  });
}

app.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.meta) update(p => p.meta[t.dataset.meta] = t.value);
  if (t.dataset.metaNumber) update(p => p.meta[t.dataset.metaNumber] = number(t.value));
  if (t.dataset.participant) update(p => p.participants[t.dataset.participant] = Math.max(0, number(t.value)));
  if (t.dataset.expenseField) {
    const numericFields = ['unitAmount','contractTotal'];
    updateExpense(t.dataset.id, t.dataset.expenseField, numericFields.includes(t.dataset.expenseField) ? Math.max(0, number(t.value)) : t.value);
  }
  if (t.dataset.expenseNullNumber) updateExpense(t.dataset.id, t.dataset.expenseNullNumber, t.value === '' ? null : Math.max(0, number(t.value)));
  if (t.dataset.accountField) updateAccount(t.dataset.id, t.dataset.accountField, t.value);
  if (t.dataset.accountNullNumber) updateAccount(t.dataset.id, t.dataset.accountNullNumber, t.value === '' ? null : Math.max(0, number(t.value)));
  if (t.dataset.ruleField) updateRule(t.dataset.id, t.dataset.ruleField, t.value);
  if (t.dataset.ruleNumber) updateRule(t.dataset.id, t.dataset.ruleNumber, Math.max(0, number(t.value)));
});

app.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.ruleCohort) {
    update(project => {
      const rule = project.fundingRules.find(r => r.id === t.dataset.id);
      if (!rule) return;
      const key = t.dataset.ruleCohort;
      rule.targetCohorts = t.checked ? [...new Set([...rule.targetCohorts, key])] : rule.targetCohorts.filter(v => v !== key);
    });
  }
  if (t.dataset.ruleExpense) {
    update(project => {
      const rule = project.fundingRules.find(r => r.id === t.dataset.id);
      if (!rule) return;
      const key = t.dataset.ruleExpense;
      rule.eligibleExpenseIds = t.checked ? [...new Set([...rule.eligibleExpenseIds, key])] : rule.eligibleExpenseIds.filter(v => v !== key);
    });
  }
});

app.addEventListener('click', e => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;

  if (action === 'add-expense') {
    const newId = uid('expense');
    update(p => p.expenses.push({ id:newId, name:'새 비용', category:'기타', calcMode:'perPerson', scope:'participants', unitAmount:0, actualUnitAmount:null, rounding:'floor10', note:'' }));
  }
  if (action === 'delete-expense') {
    update(p => {
      p.expenses = p.expenses.filter(e=>e.id!==id);
      p.fundingRules.forEach(r => r.eligibleExpenseIds = r.eligibleExpenseIds.filter(v=>v!==id));
    });
  }
  if (action === 'move-expense-up' || action === 'move-expense-down') {
    update(p => {
      const i = p.expenses.findIndex(e=>e.id===id);
      const j = action.endsWith('up') ? i-1 : i+1;
      if (i<0 || j<0 || j>=p.expenses.length) return;
      [p.expenses[i],p.expenses[j]]=[p.expenses[j],p.expenses[i]];
    });
  }
  if (action === 'add-account') {
    update(p => p.fundAccounts.push({id:uid('account'), name:'새 재원', type:'school', budgetAmount:null, note:''}));
  }
  if (action === 'delete-account') {
    update(p => {
      if (p.fundingRules.some(r=>r.accountId===id)) { toast('이 재원을 사용하는 지원 규칙을 먼저 삭제하거나 변경해 주세요.'); return; }
      p.fundAccounts = p.fundAccounts.filter(a=>a.id!==id);
    });
  }
  if (action === 'add-rule') {
    update(p => p.fundingRules.push({
      id:uid('rule'), accountId:p.fundAccounts[0]?.id ?? '', name:'새 지원 규칙', kind:'perCapita',
      targetCohorts:['regular'], unitAmount:0, eligibleExpenseIds:p.expenses.map(e=>e.id)
    }));
  }
  if (action === 'delete-rule') update(p => p.fundingRules = p.fundingRules.filter(r=>r.id!==id));
  if (action === 'move-rule-up' || action === 'move-rule-down') {
    update(p => {
      const i = p.fundingRules.findIndex(r=>r.id===id);
      const j = action.endsWith('up') ? i-1 : i+1;
      if (i<0 || j<0 || j>=p.fundingRules.length) return;
      [p.fundingRules[i],p.fundingRules[j]]=[p.fundingRules[j],p.fundingRules[i]];
    });
  }
});

tabs.forEach(tab => tab.addEventListener('click', () => {
  activeTab = tab.dataset.tab;
  render();
  window.scrollTo({top:0, behavior:'smooth'});
}));

exportBtn.addEventListener('click', () => {
  const p = getState();
  const filename = `${p.meta.schoolYear}_${p.meta.grade}학년_${p.meta.title || '체험학습'}_프로젝트.json`.replace(/[\\/:*?"<>|]/g,'_');
  downloadJson(filename, p);
  toast('프로젝트 JSON을 저장했습니다.');
});

importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed?.meta || !parsed?.participants || !Array.isArray(parsed?.expenses)) throw new Error('형식 오류');
    setState(parsed);
    toast('프로젝트를 불러왔습니다.');
  } catch {
    toast('올바른 프로젝트 JSON 파일이 아닙니다.');
  } finally { importInput.value = ''; }
});

resetBtn.addEventListener('click', () => {
  if (!confirm('현재 입력값을 지우고 2학년 수학여행 예시 데이터로 초기화할까요?')) return;
  resetState();
  toast('예시 데이터로 초기화했습니다.');
});
printBtn.addEventListener('click', () => window.print());

subscribe(render);
render();
