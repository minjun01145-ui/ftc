import { calculateExpense, calculateStaffExpense } from '../../engine.js';
import { createFundingSource, FTC_SCHOOL_SCOPE } from '../../presets.js';
import { escapeHtml, formatWon, number, uid } from '../../utils.js';
import {
  buildProposalLines,
  calculateWorkflow,
  compareConfirmedPlan,
  attendanceInputValues,
  reconcileAdministrativeEntries,
  summarizeAttendance,
  COHORTS
} from '../../workflowEngine.js';

const money = value => formatWon(Math.round(number(value)));
const count = value => Math.max(0, Math.floor(number(value)));

const groups = [
  ['vulnerable', '취약 참여'], ['regular', '비취약 참여'],
  ['vulnerableAbsent', '취약 불참'], ['regularAbsent', '비취약 불참'],
  ['unclassified', '구분 미입력 비용']
];
const categories = [
  ['vehicle', '차량'], ['lodging', '숙박'], ['meal', '식사'], ['ticket', '관람/입장'],
  ['insurance', '보험'], ['culture', '문화예술'], ['other', '기타']
];
const classLabels = { education: '교육청', school: '학교', student: '학생 부담', external: '외부' };
const groupLabels = Object.fromEntries(COHORTS.map(item => [item.key, item.label]));

function numberInput(label, value, key, { blank = false, actual = false } = {}) {
  const attr = actual ? `data-actual-count="${key}"` : `data-attendance-field="${key}"`;
  return `<label class="workflow-field">${label}<input type="number" min="0" step="1" ${attr} value="${blank ? '' : escapeHtml(value ?? '')}"></label>`;
}

function attendanceFields(value, totalEnrollment, actual = false) {
  const fields = attendanceInputValues(value, totalEnrollment);
  const input = (label, key) => numberInput(label, fields[key], key, {
    blank: actual && fields[key] === null,
    actual
  });
  return `
    <div class="workflow-count-sections">
      <section class="workflow-count-group"><h3>신청 결과</h3><div class="workflow-count-grid">
        ${input('신청 학생 수', 'applicants')}
        ${input('인솔자 수', 'chaperones')}
      </div></section>
      <section class="workflow-count-group"><h3>취약계층</h3><div class="workflow-count-grid">
        ${input('취약계층 재적 인원', 'vulnerableEnrolled')}
        ${input('취약계층 미신청 인원', 'vulnerableNotApplied')}
      </div></section>
      <section class="workflow-count-group"><h3>당일 불참</h3><div class="workflow-count-grid">
        ${input('취약계층 당일 불참 인원', 'vulnerableDayAbsent')}
        ${input('비취약계층 당일 불참 인원', 'regularDayAbsent')}
      </div></section>
    </div>`;
}

function optionList(options, selected) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function expenseAmount(expense) {
  return expense.calcMethod === 'perPerson' ? number(expense.unitAmount) : number(expense.planAmount);
}

function customCohortInputs(expense) {
  const values = expense.customCohorts ?? {};
  return `<div class="custom-cohort-grid" data-custom-cohorts ${expense.quantityBase === 'custom' ? '' : 'hidden'}>
    ${groups.map(([key, label]) => `<label>${label}<input type="number" min="0" step="1" data-cohort-count="${key}" value="${count(values[key])}"></label>`).join('')}
  </div>`;
}

function costRow(expense, project, kind) {
  const student = kind === 'student';
  const plan = student ? calculateExpense(expense, project, false).studentTotal : calculateStaffExpense(expense, project, false).total;
  const quantityOptions = [
    ['participants', '실제 참여'], ['participantsPlusAbsent', '계약 후 불참 포함'],
    ['fixedCostAbsent', '고정비 부담 불참만 추가'], ['totalStudents', '재적 전체'], ['custom', '직접 인원']
  ];
  const methodOptions = [
    ['perPerson', '1인당 × 수량'], ['fixedStudent', student ? '학생 계약 총액' : '인솔자/운영 총액'],
    ['sharedFixed', '학생+인솔자 공통 계약액']
  ];
  return `<tr data-cost-row data-cost-kind="${kind}" data-expense-id="${escapeHtml(expense.id)}">
    <td>${escapeHtml(expense.name || '이름 없는 항목')}<small>${escapeHtml(expense.id.slice(0, 15))}</small></td>
    <td><select data-cost-field="category">${optionList(categories, expense.category ?? 'other')}</select></td>
    <td><select data-cost-field="calcMethod">${optionList(methodOptions, expense.calcMethod)}</select></td>
    <td><select data-cost-field="quantityBase">${optionList(quantityOptions, expense.quantityBase)}</select><input class="compact-number" type="number" min="0" step="1" data-cost-field="customQuantity" value="${count(expense.customQuantity)}" ${expense.quantityBase === 'custom' ? '' : 'disabled'}></td>
    <td><input type="number" min="0" step="1" data-cost-field="amount" value="${expenseAmount(expense)}"></td>
    <td class="number">${money(plan)}</td>
    <td><input type="number" min="0" step="1" placeholder="미입력" data-cost-field="actualAmount" value="${expense.actualAmount == null ? '' : number(expense.actualAmount)}"></td>
    <td><input type="number" min="0" step="1" placeholder="없으면 0" data-cost-field="refund" value="${number(project.workflow?.actual?.refunds?.[expense.id])}"></td>
    ${student ? '' : `<td><input type="number" min="0" step="1" placeholder="전원" data-cost-field="paidStaffCount" value="${expense.paidStaffCount == null ? '' : count(expense.paidStaffCount)}"></td><td><select data-cost-field="costOwner">${optionList([['staff', '인솔자 경비'], ['operation', '운영 경비']], expense.costOwner === 'operation' ? 'operation' : 'staff')}</select></td>`}
  </tr><tr class="custom-cohort-row" data-custom-row="${escapeHtml(expense.id)}" ${expense.quantityBase === 'custom' ? '' : 'hidden'}><td colspan="${student ? 8 : 10}">${customCohortInputs(expense)}</td></tr>`;
}

function renderCosts(project) {
  const studentRows = (project.expenses ?? []).map(expense => costRow(expense, project, 'student')).join('');
  const staffRows = (project.staffExpenses ?? []).map(expense => costRow(expense, project, 'staff')).join('');
  return `
    <h2>비용과 실제 집행 입력</h2>
    <div class="table-wrap workflow-table-wrap"><table class="workflow-cost-table">
      <thead><tr><th>비용 항목</th><th>분류</th><th>산식</th><th>청구 기준/직접 인원</th><th>단가/계약액</th><th>계획 학생/인솔자 금액</th><th>실제 총액</th><th>환불액</th></tr></thead>
      <tbody>${studentRows || '<tr><td colspan="8" class="center">비용 행은 체험처/비용에서 추가하세요.</td></tr>'}</tbody>
    </table></div>
    <div class="table-wrap workflow-table-wrap"><table class="workflow-cost-table staff-cost-table">
      <thead><tr><th>인솔자/운영 항목</th><th>분류</th><th>산식</th><th>청구 기준/직접 인원</th><th>단가/계약액</th><th>계획 금액</th><th>실제 총액</th><th>환불액</th><th>유료 인솔자 수</th><th>회계 분류</th></tr></thead>
      <tbody>${staffRows || '<tr><td colspan="10" class="center">인솔자·운영 비용 행은 체험처/비용에서 추가하세요.</td></tr>'}</tbody>
    </table></div>
    `;
}

function sourceCard(source, project) {
  const categoryChecks = categories.map(([key, label]) => `
    <label class="mini-check"><input type="checkbox" data-resource-category="${key}" ${(source.eligibleCategories ?? []).includes(key) ? 'checked' : ''}>${label}</label>`).join('');
  const groupChecks = groups.map(([key, label]) => `
    <label class="mini-check"><input type="checkbox" data-resource-group="${key}" ${(source.eligibleGroups ?? []).includes(key) ? 'checked' : ''}>${label}</label>`).join('');
  const limitLabels = [
    ['vulnerable', '취약 참여 1인 한도'], ['regular', '비취약 참여 1인 한도'],
    ['vulnerableAbsent', '취약 불참 1인 한도'], ['regularAbsent', '비취약 불참 1인 한도'],
    ['unclassified', '미분류 비용 1인 한도']
  ];
  return `<div class="resource-card" data-resource-row data-source-id="${escapeHtml(source.id)}">
    <div class="resource-main-row">
      <label>재원명<input type="text" data-resource-field="name" value="${escapeHtml(source.name)}"></label>
      <label>보고 분류<select data-resource-field="reportClass">${optionList([['education', '교육청'], ['school', '학교'], ['student', '학생 부담'], ['external', '외부']], source.reportClass)}</select></label>
      <label>교부/배정액<input type="number" min="0" step="1" data-resource-field="issuedAmount" placeholder="미입력" value="${source.issuedAmount == null ? '' : number(source.issuedAmount)}"></label>
      <label>우선순위<input type="number" step="1" data-resource-field="priority" value="${number(source.priority, 10)}"></label>
      <label class="mini-check"><input type="checkbox" data-resource-field="returnRequired" ${source.returnRequired ? 'checked' : ''}>잔액 반납 대조</label>
      <button type="button" class="small-button danger no-print" data-action="delete-source">삭제</button>
    </div>
    <input type="hidden" data-resource-field="id" value="${escapeHtml(source.id)}">
    <div class="resource-sub-row"><strong>지원 대상</strong>${groupChecks}</div>
    <div class="resource-limit-grid">${limitLabels.map(([key, label]) => `<label>${label}<input type="number" min="0" step="1" data-source-limit="${key}" placeholder="빈칸=실비 전액" value="${source.limits?.[key] == null ? '' : number(source.limits[key])}"></label>`).join('')}</div>
    <div class="resource-sub-row"><strong>사용 가능 항목 · 미선택 시 전체</strong>${categoryChecks}</div>
    <label class="resource-actual">실제 정산 배분 입력 <input type="number" min="0" step="1" data-resource-field="actualAmount" placeholder="미입력=정책 자동 배분" value="${projectActualAmount(source, project)}"></label>
  </div>`;
}

function projectActualAmount(source, project) {
  const recorded = project.workflow?.actual?.resourceAmounts ?? {};
  const value = Object.hasOwn(recorded, source.id) ? recorded[source.id] : source.actualAmount;
  return value == null ? '' : number(value);
}

function renderResources(project) {
  const resources = project.workflow?.resources ?? [];
  return `
    <h2>재원 정책과 배정액</h2>
    <p class="help">공란 한도는 실비, 0은 미지원입니다. 학생 부담 재원은 학생 부담 합계에 포함됩니다.</p>
    <div class="resource-list">${resources.map(source => sourceCard(source, project)).join('') || '<p class="empty">등록된 재원이 없습니다. 교육청·학교·외부 지원을 추가하세요. 남은 비용은 학생 부담으로 표시됩니다.</p>'}</div>
    <div class="toolbar no-print"><button type="button" data-action="add-source">재원 추가</button></div>`;
}

function expenseOptions(project, selected) {
  return (project.expenses ?? []).map(expense => `<option value="${escapeHtml(expense.id)}" ${expense.id === selected ? 'selected' : ''}>${escapeHtml(expense.name || expense.id)}</option>`).join('');
}

function sourceOptions(project, selected) {
  return (project.workflow?.resources ?? []).map(source => `<option value="${escapeHtml(source.id)}" ${source.id === selected ? 'selected' : ''}>${escapeHtml(source.name || source.id)}</option>`).join('');
}

function manualRow(row, project) {
  return `<tr data-manual-row data-row-id="${escapeHtml(row.id)}">
    <td><select data-manual-field="expenseId">${expenseOptions(project, row.expenseId)}</select></td>
    <td><select data-manual-field="sourceId">${sourceOptions(project, row.sourceId)}</select></td>
    <td><select data-manual-field="group">${optionList(groups, row.group)}</select></td>
    <td><input type="number" min="0" step="1" data-manual-field="amount" value="${number(row.amount)}"></td>
    <td><input type="text" data-manual-field="reason" value="${escapeHtml(row.reason)}"></td>
    <td><button type="button" class="small-button danger no-print" data-action="delete-manual-allocation">삭제</button><input type="hidden" data-manual-field="id" value="${escapeHtml(row.id)}"></td>
  </tr>`;
}

function renderManualAllocations(project) {
  const rows = project.workflow?.manualAllocations ?? [];
  return `<h2>수동 재원 배분 조정</h2>
    <div class="table-wrap"><table class="manual-allocation-table"><thead><tr><th>비용</th><th>재원</th><th>대상</th><th>금액</th><th>조정 사유</th><th></th></tr></thead>
    <tbody>${rows.map(row => manualRow(row, project)).join('') || '<tr data-manual-empty><td colspan="6" class="center">수동 조정이 없습니다.</td></tr>'}</tbody></table></div>
    <div class="toolbar no-print"><button type="button" data-action="add-manual-allocation" ${!project.expenses?.length || !project.workflow?.resources?.length ? 'disabled' : ''}>수동 조정 추가</button></div>`;
}

function adminRow(entry, project) {
  return `<tr data-admin-row data-row-id="${escapeHtml(entry.id)}">
    <td><select data-admin-field="kind">${optionList([['commitment', '원인행위'], ['payment', '지급'], ['refund', '환불']], entry.kind)}</select></td>
    <td><input type="date" data-admin-field="date" value="${escapeHtml(entry.date)}"></td>
    <td><input type="text" data-admin-field="vendor" value="${escapeHtml(entry.vendor)}"></td>
    <td><select data-admin-field="expenseId"><option value="">비용 연결 · 지원금 반납은 비움</option>${expenseOptions(project, entry.expenseId)}</select></td>
    <td><select data-admin-field="sourceId"><option value="">재원 선택</option>${sourceOptions(project, entry.sourceId)}</select></td>
    <td><input type="number" min="0" step="1" placeholder="입력 필요" data-admin-field="amount" value="${entry.amount == null ? '' : number(entry.amount)}"></td>
    <td><input type="text" data-admin-field="document" value="${escapeHtml(entry.document)}"></td>
    <td><input type="text" data-admin-field="memo" value="${escapeHtml(entry.memo)}"></td>
    <td><button type="button" class="small-button danger no-print" data-action="delete-admin-entry">삭제</button><input type="hidden" data-admin-field="id" value="${escapeHtml(entry.id)}"></td>
  </tr>`;
}

function renderAdminEntries(project, plan, actual) {
  const comparisonPlan = project.workflow?.confirmedPlan
    ? { rows: (project.workflow.confirmedPlan.calculations.allocations ?? []).map(row => ({ id: row.id, name: row.name, studentCost: row.studentCost, contractAmount: row.contractAmount })) }
    : plan;
  const reconciliation = reconcileAdministrativeEntries(project, comparisonPlan, actual);
  const rows = reconciliation.rows.map(row => `<tr>
    <td>${escapeHtml(row.name || row.expenseId)}</td><td>${money(row.planned)}</td>
    <td>${row.committed == null ? '미대조' : money(row.committed)}</td>
    <td>${row.commitmentDifference == null ? '—' : money(row.commitmentDifference)}</td>
    <td>${row.netPayments == null ? '미대조' : money(row.netPayments)}</td>
    <td>${row.actual == null ? '미입력' : money(row.actual)}</td>
    <td>${row.paymentDifference == null ? '—' : money(row.paymentDifference)}</td><td>${row.status}</td>
  </tr>`).join('');
  return `<h2>행정실 원인행위·지급 대조</h2>
    <p class="help">원인행위와 지급/환불은 별도 입력입니다. 지급액이 원인행위액보다 작은 경우는 일부 지급 상태로 보여줍니다. 지원금 반납은 환불 행에서 재원을 선택하고 비용 연결을 비워 입력합니다. 거래내역이 없으면 미대조입니다.</p>
    <div class="table-wrap"><table class="admin-entry-table"><thead><tr><th>구분</th><th>일자</th><th>거래처</th><th>관련 비용</th><th>재원</th><th>금액</th><th>문서번호</th><th>메모</th><th></th></tr></thead>
      <tbody>${(project.workflow?.administrativeEntries ?? []).map(entry => adminRow(entry, project)).join('') || '<tr data-admin-empty><td colspan="9" class="center">행정실 자료를 입력하지 않았습니다. 현재 상태는 미대조입니다.</td></tr>'}</tbody>
    </table></div>
    <div class="toolbar no-print"><button type="button" data-action="add-admin-entry">거래내역 추가</button></div>
    <h3>거래별 대조 결과 · ${reconciliation.status}</h3>
    <div class="table-wrap"><table class="reconciliation-table"><thead><tr><th>비용</th><th>품의 예정액</th><th>원인행위</th><th>원인행위 차액</th><th>순지급액</th><th>실제 집행액</th><th>지급 차액</th><th>상태</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="center">대조할 비용이 없습니다.</td></tr>'}</tbody></table></div>`;
}

function renderReturnReconciliation(project, plan, actual) {
  const comparePlan = project.workflow?.confirmedPlan
    ? { rows: (project.workflow.confirmedPlan.calculations.allocations ?? []).map(row => ({
      id: row.id, name: row.name, studentCost: row.studentCost, contractAmount: row.contractAmount
    })) }
    : plan;
  const rows = reconcileAdministrativeEntries(project, comparePlan, actual).returnRows.map(row => `<tr>
    <td>${escapeHtml(row.name)}</td><td>${row.expectedReturn == null ? '교부액 미입력' : money(row.expectedReturn)}</td>
    <td>${row.returned == null ? '미입력' : money(row.returned)}</td><td>${row.difference == null ? '—' : `${row.difference > 0 ? '+' : ''}${money(row.difference)}`}</td><td>${row.status}</td>
  </tr>`).join('');
  return `<h3>지원금 잔액과 실제 반납 대조</h3>
    <p class="help">반납 산출액은 실제 교부액−실제 배분 집행액입니다. 행정실 거래에서 구분을 환불로, 재원을 선택하고 비용은 비워 입력하면 실제 반납액으로 대조합니다.</p>
    <div class="table-wrap"><table><thead><tr><th>재원</th><th>반납 산출액</th><th>행정실 반납액</th><th>차이</th><th>상태</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="center">반납 대조 대상 재원이 없습니다.</td></tr>'}</tbody></table></div>`;
}

function renderFinanceTables(plan, actual, project) {
  const planRows = project.workflow?.confirmedPlan?.proposalLines ?? buildProposalLines(plan, project);
  const rows = planRows.map(row => `<tr>
    <td>${escapeHtml(row.date || '-')}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(groupLabels[row.group] ?? row.group)}</td>
    <td>${escapeHtml(row.source)}</td><td class="number">${row.quantity}</td><td class="number">${money(row.unitAmount)}</td>
    <td class="number">${money(row.amount)}</td><td>${escapeHtml(row.calculation)}</td><td>${escapeHtml(row.note)}</td>
  </tr>`).join('');
  const actualRows = actual.rows.map(row => `<tr>
    <td>${escapeHtml(row.name || row.id)}</td><td>${money(row.grossAmount)}</td><td>${money(row.refundAmount)}</td>
    <td>${money(row.studentCost)}</td><td>${money(row.funded)}</td><td>${money(row.student)}</td>
  </tr>`).join('');
  const actualStatus = actual.missingActual ? '초안 · 실제 인원/비용 입력이 남아 있습니다.' : '실적 입력 완료';
  const missing = [
    ...(actual.missingAttendance.length ? [`실적 인원 ${actual.missingAttendance.length}개 항목 미입력`] : []),
    ...(actual.missingExpenseIds.length ? [`학생 비용 ${actual.missingExpenseIds.length}개 미입력`] : []),
    ...(actual.missingStaffExpenseIds.length ? [`인솔자/운영 비용 ${actual.missingStaffExpenseIds.length}개 미입력`] : [])
  ];
  return `
    <h2>품의용 재원별 세부표</h2>
    <div class="table-wrap"><table class="proposal-table"><thead><tr><th>일자</th><th>항목</th><th>대상</th><th>재원</th><th>인원/수량</th><th>단가</th><th>금액</th><th>산식</th><th>비고</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="center">비용과 재원을 입력하면 품의 행이 생성됩니다.</td></tr>'}</tbody>
    <tfoot><tr><th colspan="6">품의 학생경비 합계</th><th>${money(planRows.reduce((sum, row) => sum + row.amount, 0))}</th><th colspan="2">원본 비용과 재원 분할 합계</th></tr></tfoot></table></div>
    <h2>시행 후 실적 · ${actualStatus}</h2>
    ${missing.length ? `<div class="status-box"><span class="error-text">${missing.map(escapeHtml).join(' · ')}</span></div>` : '<div class="status-box"><span class="ok-text">실적 입력 항목이 모두 채워졌습니다.</span></div>'}
    <div class="table-wrap"><table class="settlement-cost-table"><thead><tr><th>비용</th><th>실제 총액</th><th>환불</th><th>순집행 학생경비</th><th>재원 배분</th><th>학생 부담</th></tr></thead>
      <tbody>${actualRows || '<tr><td colspan="6" class="center">실제 비용이 아직 입력되지 않았습니다. 계획 비용은 실적 합계로 대체하지 않습니다.</td></tr>'}</tbody>
      <tfoot><tr><th>입력된 실적 합계</th><th>${money(actual.rows.reduce((sum, row) => sum + number(row.grossAmount), 0))}</th><th>${money(actual.rows.reduce((sum, row) => sum + number(row.refundAmount), 0))}</th><th>${money(actual.studentCost)}</th><th>${money(actual.resourceTotals.reduce((sum, row) => sum + row.used, 0))}</th><th>${money(actual.studentUsed)}</th></tr></tfoot>
    </table></div>
    ${renderReturnReconciliation(project, plan, actual)}
    <div class="finance-summary-grid">
      <div><strong>계획 학생경비</strong><span>${money(plan.studentCost)}</span></div>
      <div><strong>확정 계획에 사용한 재원</strong><span>${money(plan.studentCost - plan.studentUsed)}</span></div>
      <div><strong>계획 비취약 1인 부담</strong><span>${money(plan.regularBurden)}</span></div>
      <div><strong>인솔자 경비</strong><span>${money(plan.staffTotal)}</span></div>
      <div><strong>운영 경비</strong><span>${money(plan.operationTotal)}</span></div>
      <div><strong>계획 행사 전체</strong><span>${money(plan.eventTotal)}</span></div>
      <div><strong>실적 입력분 재원</strong><span>${money(actual.resourceTotals.reduce((sum, row) => sum + row.used, 0))}</span></div>
      <div><strong>실적 입력분 학생 부담</strong><span>${money(actual.studentUsed)}</span></div>
      <div><strong>실적 입력분 행사 전체</strong><span>${actual.missingActual ? `부분 ${money(actual.eventTotal)}` : money(actual.eventTotal)}</span></div>
    </div>`;
}

function renderPlanComparison(project, school, plan, actual) {
  const comparison = compareConfirmedPlan(project, school);
  const snapshot = project.workflow?.confirmedPlan;
  if (!snapshot) return `<div class="status-box">품의에 사용한 계획 확정본이 없습니다. 입력값을 저장한 뒤 확정본을 생성할 수 있습니다.</div>`;
  const diffRows = comparison.differences.map(row => `<tr><td>${escapeHtml(row.label)}</td><td>${money(row.before)}</td><td>${money(row.after)}</td><td class="${row.difference ? 'delta' : ''}">${row.difference > 0 ? '+' : ''}${money(row.difference)}</td></tr>`).join('');
  const currentById = new Map(actual.rows.map(row => [row.id, row]));
  const costs = (snapshot.calculations.allocations ?? []).map(row => {
    const after = currentById.get(row.id)?.studentCost;
    if (after == null) return '';
    return `<tr><td>${escapeHtml(row.name)}</td><td>${money(row.studentCost)}</td><td>${money(after)}</td><td>${money(after - row.studentCost)}</td></tr>`;
  }).join('');
  return `<div class="status-box"><strong>품의 계획 ${escapeHtml(snapshot.revision ?? 1)}차 확정 · ${escapeHtml(snapshot.confirmedAt?.slice(0, 10) ?? '')}</strong>
    <p>실적 상태: ${comparison.status}${project.workflow?.planChangeReason ? ` · 변경 사유: ${escapeHtml(project.workflow.planChangeReason)}` : ''}</p></div>
    <div class="table-wrap"><table><thead><tr><th>비교 기준</th><th>확정 계획</th><th>입력된 현재 실적</th><th>차이</th></tr></thead><tbody>
      ${diffRows || '<tr><td colspan="4">아직 비교 가능한 실적 차이가 없습니다.</td></tr>'}</tbody></table></div>
    <h3>비용 항목별 차이</h3><div class="table-wrap"><table><thead><tr><th>항목</th><th>확정 계획</th><th>실적</th><th>차이</th></tr></thead><tbody>${costs || '<tr><td colspan="4">실제 금액을 입력하면 항목별 차이가 표시됩니다.</td></tr>'}</tbody></table></div>`;
}

function proposalReferenceComparison(project, plan) {
  const reference = project.workflow?.proposalReference ?? {};
  const people = plan.attendance.participants;
  const participantCost = plan.rows.reduce((sum, row) => sum
    + row.groups.regular.cost + row.groups.vulnerable.cost, 0);
  const currentPerPerson = people > 0 ? Math.round(participantCost / people) : null;
  const calculationRows = [
    ['제안서 본문 1인당', reference.bodyPerPerson, currentPerPerson],
    ['제안서 표 1인당 합계', reference.tablePerPerson, currentPerPerson],
    ['제안서 세부항목 1인당 합계', reference.itemizedPerPerson, currentPerPerson]
  ].filter(([, noted]) => noted !== null && noted !== undefined)
    .map(([label, noted, calculated]) => `<tr><td>${label}</td><td>${money(noted)}</td><td>${calculated == null ? '참여 인원 미입력' : money(calculated)}</td><td>${calculated == null ? '비교 대기' : `${noted - calculated > 0 ? '+' : ''}${money(noted - calculated)}`}</td></tr>`).join('');
  const sourceDiffRows = [];
  if (reference.bodyPerPerson != null && reference.tablePerPerson != null) {
    sourceDiffRows.push(`<tr><td>문서 본문−표 1인당</td><td>${money(reference.bodyPerPerson)}</td><td>${money(reference.tablePerPerson)}</td><td>${reference.bodyPerPerson - reference.tablePerPerson > 0 ? '+' : ''}${money(reference.bodyPerPerson - reference.tablePerPerson)}</td></tr>`);
  }
  if (reference.tablePerPerson != null && reference.itemizedPerPerson != null) {
    sourceDiffRows.push(`<tr><td>문서 표−세부항목</td><td>${money(reference.tablePerPerson)}</td><td>${money(reference.itemizedPerPerson)}</td><td>${reference.tablePerPerson - reference.itemizedPerPerson > 0 ? '+' : ''}${money(reference.tablePerPerson - reference.itemizedPerPerson)}</td></tr>`);
  }
  const vehicleInputs = [reference.vehicleContractAmount, reference.vehicleMultiplier, reference.vehicleDenominator, reference.vehicleQuotedUnit];
  const vehicleFormula = vehicleInputs.slice(0, 3).every(value => value !== null && value !== undefined)
    && Number(reference.vehicleDenominator) > 0
    ? Math.round(Number(reference.vehicleContractAmount) * Number(reference.vehicleMultiplier) / Number(reference.vehicleDenominator)) : null;
  const vehicleRows = plan.rows.filter(row => row.category === 'vehicle').map(row =>
    `<tr><td>현재 차량 · ${escapeHtml(row.name)}</td><td>${money(row._row.unit)}</td><td>${money(row.studentCost)}</td><td>학생 부담분</td></tr>`).join('');
  const inputDiffRows = calculationRows + sourceDiffRows.join('') || '<tr><td colspan="4" class="center">문서 기재 금액을 입력하면 현재 계산과 차이를 비교합니다.</td></tr>';
  const vehicleDiff = vehicleFormula !== null && reference.vehicleQuotedUnit !== null && reference.vehicleQuotedUnit !== undefined
    ? `<tr><td>차량 기재 산식 ${money(reference.vehicleContractAmount)} × ${number(reference.vehicleMultiplier)} ÷ ${number(reference.vehicleDenominator)}</td><td>${money(reference.vehicleQuotedUnit)}</td><td>${money(vehicleFormula)}</td><td>${reference.vehicleQuotedUnit - vehicleFormula > 0 ? '+' : ''}${money(reference.vehicleQuotedUnit - vehicleFormula)}</td></tr>`
    : '';
  return `<h3>문서 기재값과 현재 계산 비교</h3>
    <div class="table-wrap"><table><thead><tr><th>기준</th><th>문서 기재</th><th>현재 계산</th><th>기재−계산</th></tr></thead><tbody>${inputDiffRows}${vehicleDiff}</tbody></table></div>
    ${vehicleRows ? `<h4>차량 현재 계산</h4><div class="table-wrap"><table><thead><tr><th>항목</th><th>학생 단가/분담 단가</th><th>학생 부담분</th><th>범위</th></tr></thead><tbody>${vehicleRows}</tbody></table></div>` : ''}
    ${reference.memo ? `<p>${escapeHtml(reference.memo)}</p>` : ''}`;
}

function renderProposalReference(project, plan) {
  const reference = project.workflow?.proposalReference ?? {};
  const textField = (label, name, value) => `<label>${label}<input type="text" data-proposal-reference="${name}" value="${escapeHtml(value ?? '')}"></label>`;
  const moneyField = (label, name, value, step = 1) => `<label>${label}<input type="number" min="0" step="${step}" data-proposal-reference="${name}" value="${value == null ? '' : number(value)}"></label>`;
  return `<div class="proposal-reference">
    <h2>운영위원회 제안서 참고값</h2>
    <div class="workflow-business-grid">
      ${textField('문서명/회차', 'documentLabel', reference.documentLabel)}
      ${moneyField('본문 1인당 예상액', 'bodyPerPerson', reference.bodyPerPerson)}
      ${moneyField('표의 1인당 합계', 'tablePerPerson', reference.tablePerPerson)}
      ${moneyField('세부항목 1인당 합계', 'itemizedPerPerson', reference.itemizedPerPerson)}
      ${moneyField('차량 산식 금액', 'vehicleContractAmount', reference.vehicleContractAmount)}
      ${moneyField('차량 수량/배수', 'vehicleMultiplier', reference.vehicleMultiplier)}
      ${moneyField('차량 분담 인원', 'vehicleDenominator', reference.vehicleDenominator)}
      ${moneyField('문서 기재 차량 단가', 'vehicleQuotedUnit', reference.vehicleQuotedUnit)}
      ${textField('참고 메모', 'memo', reference.memo)}
    </div>
    ${reference.documentLabel ? `<p class="help">참고: ${escapeHtml(reference.documentLabel)}</p>` : ''}
    ${proposalReferenceComparison(project, plan)}
  </div>`;
}

function renderIssues(calculation) {
  if (!calculation.issues.length) return '<div class="status-box"><span class="ok-text">계산 검산: 비용 합계와 재원 분할 합계가 일치합니다.</span></div>';
  return `<div class="status-box"><strong>확인할 계산 항목</strong><ul>${calculation.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul></div>`;
}

function renderPrintSummary(project, school, plan, actual) {
  const lines = project.workflow?.confirmedPlan?.proposalLines ?? buildProposalLines(plan, project);
  const comparison = project.workflow?.confirmedPlan
    ? (project.workflow.confirmedPlan.calculations.allocations ?? []).map(row => {
      const actualRow = actual.rows.find(item => item.id === row.id);
      return `<tr><td>${escapeHtml(row.name)}</td><td>${money(row.studentCost)}</td><td>${actualRow ? money(actualRow.studentCost) : '미입력'}</td><td>${actualRow ? money(actualRow.studentCost - row.studentCost) : '—'}</td></tr>`;
    }).join('') : '';
  const reconciliation = reconcileAdministrativeEntries(project, project.workflow?.confirmedPlan
    ? { rows: project.workflow.confirmedPlan.calculations.allocations.map(row => ({ id: row.id, name: row.name, studentCost: row.studentCost, contractAmount: row.contractAmount })) }
    : plan, actual);
  const planCount = plan.attendance;
  const actualAttendance = actual.attendanceComplete
    ? `${actual.attendance.participants}명 (취약 ${actual.attendance.vulnerableParticipants}, 비취약 ${actual.attendance.regularParticipants})`
    : `미입력 (${actual.missingAttendance.length}개 항목)`;
  const costRows = [...(project.expenses ?? []).map(row => ({ ...row, kind: '학생경비' })), ...(project.staffExpenses ?? []).map(row => ({ ...row, kind: row.costOwner === 'operation' ? '운영경비' : '인솔자경비' }))]
    .map(row => `<tr><td>${escapeHtml(row.kind)}</td><td>${escapeHtml(row.name || '이름 없는 항목')}</td><td>${money(row.calcMethod === 'perPerson' ? calculateExpense(row, project).studentTotal : row.planAmount)}</td><td>${row.actualAmount == null ? '미입력' : money(row.actualAmount)}</td><td>${money(project.workflow?.actual?.refunds?.[row.id])}</td></tr>`).join('');
  const resourceRows = plan.resourceTotals.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(classLabels[row.reportClass])}</td><td>${row.issuedAmount == null ? '미입력' : money(row.issuedAmount)}</td><td>${money(row.used)}</td><td>${row.balance == null ? '미입력' : money(row.balance)}</td></tr>`).join('');
  const proposalRows = lines.map(row => `<tr><td>${escapeHtml(row.date || '-')}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(groupLabels[row.group] ?? row.group)}</td><td>${escapeHtml(row.source)}</td><td class="number">${row.quantity}</td><td class="number">${money(row.unitAmount)}</td><td class="number">${money(row.amount)}</td><td>${escapeHtml(row.calculation)}</td><td>${escapeHtml(row.note)}</td></tr>`).join('');
  const adminRows = reconciliation.rows.map(row => `<tr><td>${escapeHtml(row.name || row.expenseId)}</td><td>${money(row.planned)}</td><td>${row.committed == null ? '미대조' : money(row.committed)}</td><td>${row.netPayments == null ? '미대조' : money(row.netPayments)}</td><td>${row.actual == null ? '미입력' : money(row.actual)}</td><td>${row.status}</td></tr>`).join('');
  const returnRows = reconciliation.returnRows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${row.expectedReturn == null ? '교부액 미입력' : money(row.expectedReturn)}</td><td>${row.returned == null ? '미입력' : money(row.returned)}</td><td>${row.difference == null ? '—' : `${row.difference > 0 ? '+' : ''}${money(row.difference)}`}</td><td>${row.status}</td></tr>`).join('');
  const validationIssues = [...plan.issues, ...actual.issues];
  const hasSchoolResourceBudget = plan.resourceTotals.some(row => row.reportClass === 'school' && row.issuedAmount != null);
  const schoolResourceBudget = plan.resourceTotals
    .filter(row => row.reportClass === 'school' && row.issuedAmount != null)
    .reduce((sum, row) => sum + money(row.issuedAmount), 0);
  return `<div class="workflow-print-only">
    <h1>${escapeHtml(school.name || '학교')} ${number(school.schoolYear)}학년도 현장체험학습 검토자료</h1>
    <table class="print-meta"><tbody>
      <tr><th>사업/학년</th><td>${escapeHtml(project.title)} · ${project.grade ? `${project.grade}학년` : '학년 미지정'}</td><th>방식/기간</th><td>${escapeHtml(project.executionMode)} · ${escapeHtml(project.startDate)} ~ ${escapeHtml(project.endDate)} (${number(project.days)}일)</td></tr>
      <tr><th>장소</th><td>${escapeHtml(project.place || '-')}</td><th>참여 인원</th><td>계획 ${planCount.participants}명 (취약 ${planCount.vulnerableParticipants}, 비취약 ${planCount.regularParticipants}) · 실적 ${actualAttendance}</td></tr>
      <tr><th>학교 재원</th><td>${hasSchoolResourceBudget ? `${schoolResourceBudget}원` : '재원별 배정 확인'}</td><th>사업 계획</th><td>${project.workflow?.confirmedPlan ? `${project.workflow.confirmedPlan.revision ?? 1}차 확정본 · ${escapeHtml(project.workflow.confirmedPlan.confirmedAt?.slice(0, 10) ?? '')}` : '잠정 계획'}</td></tr>
    </tbody></table>
    <h2>비용 산출 · 취소/환불</h2><table><thead><tr><th>구분</th><th>항목</th><th>계획액</th><th>실제 총액</th><th>환불</th></tr></thead><tbody>${costRows || '<tr><td colspan="5">입력된 비용 없음</td></tr>'}</tbody></table>
    <h2>운영위원회 제안서 참고값</h2>${proposalReferenceComparison(project, plan)}
    <h2>재원별 분담 · 정산</h2><table><thead><tr><th>재원</th><th>분류</th><th>교부/배정</th><th>계획 배분</th><th>잔액</th></tr></thead><tbody>${resourceRows || '<tr><td colspan="5">재원 미입력</td></tr>'}</tbody></table>
    <p>계획 학생경비 ${money(plan.studentCost)}원 · 학생 부담 ${money(plan.studentUsed)}원 · 비취약 1인 부담 ${money(plan.regularBurden)}원 · 인솔자 ${money(plan.staffTotal)}원 · 운영 ${money(plan.operationTotal)}원 · 행사 전체 ${money(plan.eventTotal)}원</p>
    <p>실적 상태: ${actual.missingActual ? `초안/미입력 (학생경비 입력 합계 ${money(actual.studentCost)}원)` : '실적 입력 완료'} · 교육청 ${actual.missingActual ? '미확정' : money(actual.educationUsed)}원 · 학교 ${actual.missingActual ? '미확정' : money(actual.schoolUsed)}원 · 학생 ${actual.missingActual ? '미확정' : money(actual.studentUsed)}원 · 외부 ${actual.missingActual ? '미확정' : money(actual.externalUsed)}원</p>
    <h2>품의용 항목 분할표</h2><table><thead><tr><th>일자</th><th>항목</th><th>대상</th><th>재원</th><th>수량</th><th>단가</th><th>금액</th><th>산식</th><th>비고</th></tr></thead><tbody>${proposalRows || '<tr><td colspan="9">품의 행 없음</td></tr>'}</tbody><tfoot><tr><th colspan="6">합계</th><th>${money(lines.reduce((sum, row) => sum + row.amount, 0))}</th><th colspan="2">확정 계획</th></tr></tfoot></table>
    <h2>품의 계획과 정산 차이</h2><table><thead><tr><th>비용</th><th>확정 계획</th><th>실적</th><th>차이</th></tr></thead><tbody>${comparison || '<tr><td colspan="4">확정 계획 없음 또는 실제 금액 미입력</td></tr>'}</tbody></table>
    <h2>행정실 대조 · ${reconciliation.status}</h2><table><thead><tr><th>비용</th><th>품의</th><th>원인행위</th><th>순지급</th><th>실적</th><th>상태</th></tr></thead><tbody>${adminRows || '<tr><td colspan="6">행정실 거래 미입력 · 미대조</td></tr>'}</tbody></table>
    <h2>지원금 반납 대조</h2><table><thead><tr><th>재원</th><th>산출액</th><th>실제 반납</th><th>차이</th><th>상태</th></tr></thead><tbody>${returnRows || '<tr><td colspan="5">반납 대조 대상 없음</td></tr>'}</tbody></table>
    ${validationIssues.length ? `<h2>검토 필요</h2><ul>${[...new Set(validationIssues)].map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : '<p>현재 입력값 산술 검산: 합계 일치</p>'}
  </div>`;
}

function renderPlanStatus(project, plan, summary) {
  const planCount = plan.attendance;
  return `<div class="workflow-status-cards">
    <div><span>신청 학생</span><strong>${planCount.applicants}명</strong><small>인솔자 ${planCount.chaperones}명</small></div>
    <div><span>최종 참여</span><strong>${planCount.participants}명</strong><small>취약 ${planCount.vulnerableParticipants} · 비취약 ${planCount.regularParticipants}</small></div>
    <div><span>학생경비</span><strong>${money(plan.studentCost)}</strong><small>잔여 학생부담 ${money(plan.studentUsed)}</small></div>
    <div><span>확정 계획</span><strong>${project.workflow?.confirmedPlan ? `${project.workflow.confirmedPlan.revision ?? 1}차` : '미확정'}</strong><small>${project.workflow?.confirmedPlan?.confirmedAt?.slice(0, 10) ?? '저장 후 확정 가능'}</small></div>
  </div>`;
}

export function renderWorkflowSection(project, school) {
  const plan = calculateWorkflow(project, school);
  const actual = calculateWorkflow(project, school, { basis: 'actual' });
  const attendance = project.workflow?.attendance ?? {};
  const actualAttendance = project.workflow?.actual?.attendance ?? {};
  const allPlan = project.expenses ?? [];
  const visiblePlan = summarizeAttendance(attendance, project.totalStudents);
  const planRows = buildProposalLines(plan, project);
  return `
    <section class="workflow-page">
      <h1>현장체험학습 업무 흐름</h1>
      ${renderPlanStatus(project, plan, visiblePlan)}
      <fieldset class="workflow-fieldset">
        <legend>사업과 일정</legend>
        <div class="workflow-business-grid">
          <label>사업명<input name="title" type="text" value="${escapeHtml(project.title)}"></label>
          <label>학년<select name="grade"><option value="">학년 선택</option>${optionList([[1, '1학년'], [2, '2학년'], [3, '3학년']], project.grade)}</select></label>
          <label>추진 방식<select name="executionMode">${optionList([['숙박형', '숙박형'], ['일일형', '일일형'], ['혼합형', '혼합형']], project.executionMode)}</select></label>
          <label>시작일<input name="startDate" type="date" value="${escapeHtml(project.startDate)}"></label>
          <label>종료일<input name="endDate" type="date" value="${escapeHtml(project.endDate)}"></label>
          <label>일수<input name="days" type="number" min="0" step="1" value="${number(project.days)}"></label>
          <label class="wide-field">장소/목적지<input name="place" type="text" value="${escapeHtml(project.place)}"></label>
        </div>
      </fieldset>
      <fieldset class="workflow-fieldset">
        <legend>계획 인원 구분</legend>
        ${attendanceFields(attendance, project.totalStudents)}
        <p class="workflow-derived">재적 ${visiblePlan.enrolled}명 · 최종 참여 ${visiblePlan.participants}명 · 취약 ${visiblePlan.vulnerableParticipants}명 · 비취약 ${visiblePlan.regularParticipants}명</p>
      </fieldset>
      <fieldset class="workflow-fieldset">
        <legend>비용 산출과 실제 집행</legend>
        ${renderCosts(project)}
      </fieldset>
      <fieldset class="workflow-fieldset">
        <legend>재원과 품의 분할</legend>
        ${renderResources(project)}
        ${renderManualAllocations(project)}
        ${renderFinanceTables(plan, actual, project)}
        ${renderIssues(plan)}
        <div class="workflow-confirm-row no-print">
          <label>계획 변경 사유<input name="planChangeReason" type="text" value="${escapeHtml(project.workflow?.planChangeReason ?? '')}" placeholder="사전답사 단가 변경 등"></label>
          <button type="button" data-action="confirm-plan">품의용 확정 계획 저장</button>
          <span class="help">확정본은 이후 정산 입력으로 바뀌지 않습니다. 다시 확정하면 이전 확정본을 보존합니다.</span>
        </div>
      </fieldset>
      <fieldset class="workflow-fieldset">
        <legend>시행 실적</legend>
        <p class="help">실적 금액은 공란이면 미입력, 0이면 0원 집행입니다. 실제 반납 완료는 행정실 거래에 기록하세요.</p>
        ${attendanceFields(actualAttendance, project.totalStudents, true)}
        <h3>확정 계획과 실적 차이</h3>
        ${renderPlanComparison(project, school, plan, actual)}
      </fieldset>
      <fieldset class="workflow-fieldset">
        <legend>행정실 자료 대조</legend>
        ${renderAdminEntries(project, plan, actual)}
      </fieldset>
      <fieldset class="workflow-fieldset">
        <legend>검토용 보고와 제출 파일</legend>
        ${renderProposalReference(project, plan)}
        <div class="toolbar no-print">
          <button type="button" data-action="copy-proposal" ${planRows.length ? '' : 'disabled'}>품의 표 복사</button>
          <button type="button" data-action="export-workbook">공식 정산 XLSX + 검토표 내보내기</button>
          <button type="button" data-action="print-workflow">인쇄 / PDF 저장</button>
        </div>
        <div class="workflow-print-heading"><h2>${escapeHtml(school.name || '학교')} ${number(school.schoolYear)}학년도 현장체험학습 검토자료</h2></div>
        <div class="workflow-review-columns">
          <div><h3>재원별 배분</h3><div class="table-wrap"><table><thead><tr><th>재원</th><th>분류</th><th>배정/교부</th><th>적격 집행</th><th>잔액</th></tr></thead><tbody>
            ${plan.resourceTotals.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${classLabels[row.reportClass]}</td><td>${row.issuedAmount == null ? '미입력' : money(row.issuedAmount)}</td><td>${money(row.used)}</td><td>${row.balance == null ? '미입력' : money(row.balance)}</td></tr>`).join('') || '<tr><td colspan="5">재원을 입력하지 않았습니다.</td></tr>'}
            <tr><th>학생 부담</th><td>학생</td><td>자동 잔액</td><td>${money(plan.studentUsed)}</td><td>—</td></tr>
          </tbody></table></div></div>
          <div><h3>입력값 검증</h3>${renderIssues(plan)}<p class="help">원인행위/지급 대조 상태: ${reconcileAdministrativeEntries(project, project.workflow?.confirmedPlan ? { rows: project.workflow.confirmedPlan.calculations.allocations.map(row => ({ id: row.id, name: row.name, studentCost: row.studentCost, contractAmount: row.contractAmount })) } : plan, actual).status}</p></div>
        </div>
      </fieldset>
      <div class="page-actions no-print"><button type="button" data-action="save-workflow">업무 흐름 저장</button><button type="button" data-action="delete-project" class="danger">이 사업 삭제</button></div>
      ${renderPrintSummary(project, school, plan, actual)}
    </section>`;
}

export function newSourceRowHtml() {
  return sourceCard(createFundingSource(), { workflow: { actual: { resourceAmounts: {} } } });
}

export function newManualRowHtml(project) {
  const expense = project.expenses?.[0];
  const source = project.workflow?.resources?.[0];
  if (!expense || !source) return '';
  return manualRow({ id: uid('allocation'), expenseId: expense.id, sourceId: source.id, group: 'regular', amount: 0, reason: '' }, project);
}

export function newAdminRowHtml(project) {
  return adminRow({ id: uid('admin'), kind: 'commitment', date: '', vendor: '', expenseId: '', sourceId: '', amount: null, document: '', memo: '' }, project);
}

export function readWorkflowForm(form, previous) {
  const next = structuredClone(previous);
  const value = name => form.querySelector(`[name="${name}"]`)?.value ?? '';
  next.title = value('title').trim() || next.title;
  next.grade = value('grade') ? Number(value('grade')) : '';
  next.schoolLevel = FTC_SCHOOL_SCOPE.schoolLevel;
  next.establishment = FTC_SCHOOL_SCOPE.establishment;
  next.executionMode = value('executionMode');
  next.startDate = value('startDate');
  next.endDate = value('endDate');
  next.days = count(value('days'));
  next.place = value('place').trim();
  const previousAttendance = next.workflow?.attendance ?? {};
  const planValues = Object.fromEntries(countFieldsFromForm(form, 'data-attendance-field'));
  const planAttendance = {
    schema: 'core-v1',
    ...planValues,
    ...((previousAttendance.schema === 'legacy-v5' || previousAttendance.legacyAttendance)
      ? { legacyAttendance: previousAttendance.legacyAttendance ?? previousAttendance } : {})
  };
  next.workflow = {
    ...next.workflow,
    attendance: planAttendance,
    proposalReference: readProposalReference(form),
    planChangeReason: value('planChangeReason').trim()
  };
  const previousActualAttendance = next.workflow?.actual?.attendance ?? {};
  const actualValues = Object.fromEntries(countFieldsFromForm(form, 'data-actual-count', true));
  const actualAttendance = {
    schema: 'core-v1',
    ...actualValues,
    ...((previousActualAttendance.schema === 'legacy-v5' || previousActualAttendance.legacyAttendance)
      ? { legacyAttendance: previousActualAttendance.legacyAttendance ?? previousActualAttendance } : {})
  };
  next.workflow.actual = {
    ...next.workflow.actual,
    attendance: actualAttendance,
    refunds: { ...next.workflow.actual.refunds },
    resourceAmounts: { ...next.workflow.actual.resourceAmounts }
  };
  const parseCosts = (kind, oldRows) => {
    const oldById = new Map(oldRows.map(row => [row.id, row]));
    return [...form.querySelectorAll(`[data-cost-row][data-cost-kind="${kind}"]`)].map(row => {
      const id = row.dataset.expenseId;
      const previousExpense = oldById.get(id);
      if (!previousExpense) return null;
      const field = name => row.querySelector(`[data-cost-field="${name}"]`);
      const calcMethod = field('calcMethod').value;
      const amount = wonInput(field('amount').value);
      const actualValue = field('actualAmount').value;
      const cohortRow = form.querySelector(`[data-custom-row="${CSS.escape(id)}"]`);
      const cohortValues = cohortRow
        ? Object.fromEntries([...cohortRow.querySelectorAll('[data-cohort-count]')].map(input => [input.dataset.cohortCount, count(input.value)]))
        : previousExpense.customCohorts;
      const customCohorts = field('quantityBase').value === 'custom' ? cohortValues : previousExpense.customCohorts;
      const refund = wonInput(field('refund').value);
      next.workflow.actual.refunds[id] = refund;
      return {
        ...previousExpense,
        category: field('category').value,
        calcMethod,
        quantityBase: field('quantityBase').value,
        customQuantity: customCohorts ? Object.values(customCohorts).reduce((sum, item) => sum + count(item), 0) : count(field('customQuantity').value),
        customCohorts,
        paidStaffCount: kind === 'staff'
          ? (field('paidStaffCount')?.value === '' ? null : count(field('paidStaffCount').value))
          : previousExpense.paidStaffCount,
        unitAmount: calcMethod === 'perPerson' ? amount : previousExpense.unitAmount,
        planAmount: calcMethod === 'perPerson' ? previousExpense.planAmount : amount,
        actualAmount: actualValue === '' ? null : Math.max(0, Math.round(Number(actualValue))),
        costOwner: kind === 'staff' ? (field('costOwner')?.value ?? 'staff') : 'student'
      };
    }).filter(Boolean);
  };
  next.expenses = parseCosts('student', next.expenses ?? []);
  next.staffExpenses = parseCosts('staff', next.staffExpenses ?? []);
  const sources = [...form.querySelectorAll('[data-resource-row]')].map(row => {
    const field = name => row.querySelector(`[data-resource-field="${name}"]`);
    const sourceId = field('id').value || uid('funding');
    const issued = field('issuedAmount').value;
    const actual = field('actualAmount').value;
    const limits = Object.fromEntries([...row.querySelectorAll('[data-source-limit]')].map(input => [
      input.dataset.sourceLimit,
      input.value === '' ? null : Math.max(0, Math.round(Number(input.value)))
    ]));
    const selectedGroups = [...row.querySelectorAll('[data-resource-group]:checked')].map(input => input.dataset.resourceGroup);
    const selectedCategories = [...row.querySelectorAll('[data-resource-category]:checked')].map(input => input.dataset.resourceCategory);
    next.workflow.actual.resourceAmounts[sourceId] = actual === '' ? null : Math.max(0, Math.round(Number(actual)));
    return {
      id: sourceId,
      name: field('name').value.trim(),
      reportClass: field('reportClass').value,
      returnRequired: field('returnRequired').checked,
      issuedAmount: issued === '' ? null : Math.max(0, Math.round(Number(issued))),
      priority: number(field('priority').value, 10),
      eligibleGroups: selectedGroups,
      eligibleCategories: selectedCategories,
      limits,
      actualAmount: actual === '' ? null : Math.max(0, Math.round(Number(actual)))
    };
  });
  next.workflow.resources = sources;
  next.workflow.manualAllocations = [...form.querySelectorAll('[data-manual-row]')].map(row => {
    const field = name => row.querySelector(`[data-manual-field="${name}"]`);
    return {
      id: field('id').value || uid('allocation'),
      expenseId: field('expenseId').value,
      sourceId: field('sourceId').value,
      group: field('group').value,
      amount: wonInput(field('amount').value),
      reason: field('reason').value.trim()
    };
  });
  next.workflow.administrativeEntries = [...form.querySelectorAll('[data-admin-row]')].map(row => {
    const field = name => row.querySelector(`[data-admin-field="${name}"]`);
    const fields = ['date', 'vendor', 'expenseId', 'sourceId', 'document', 'memo'].map(name => field(name).value.trim());
    const amountText = field('amount').value;
    if (fields.every(item => !item) && amountText === '') return null;
    return {
      id: field('id').value || uid('admin'),
      kind: field('kind').value,
      date: field('date').value,
      vendor: field('vendor').value.trim(),
      expenseId: field('expenseId').value,
      sourceId: field('sourceId').value,
      amount: amountText === '' ? null : wonInput(amountText),
      document: field('document').value.trim(),
      memo: field('memo').value.trim()
    };
  }).filter(Boolean);
  const summary = summarizeAttendance(planAttendance, next.totalStudents);
  next.actualParticipants = summary.participants;
  next.absentStudents = Math.max(0, summary.enrolled - summary.participants);
  next.vulnerableStudents = summary.vulnerableEnrolled;
  next.vulnerableParticipants = summary.vulnerableParticipants;
  next.vulnerableAbsent = summary.vulnerableAbsent;
  next.chaperones = summary.chaperones;
  return next;
}

function readProposalReference(form) {
  const get = name => form.querySelector(`[data-proposal-reference="${name}"]`)?.value ?? '';
  const readMoney = name => get(name) === '' ? null : wonInput(get(name));
  return {
    documentLabel: get('documentLabel').trim(),
    bodyPerPerson: readMoney('bodyPerPerson'),
    tablePerPerson: readMoney('tablePerPerson'),
    itemizedPerPerson: readMoney('itemizedPerPerson'),
    vehicleContractAmount: readMoney('vehicleContractAmount'),
    vehicleMultiplier: readMoney('vehicleMultiplier'),
    vehicleDenominator: readMoney('vehicleDenominator'),
    vehicleQuotedUnit: readMoney('vehicleQuotedUnit'),
    memo: get('memo').trim()
  };
}

function countFieldsFromForm(form, attribute, nullable = false) {
  return [...form.querySelectorAll(`[${attribute}]`)].map(input => {
    const key = input.getAttribute(attribute);
    return [key, input.value === '' ? (nullable ? null : 0) : Number(input.value)];
  });
}

function wonInput(value) {
  return Math.max(0, Math.round(number(value)));
}
