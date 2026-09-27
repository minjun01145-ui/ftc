import { calculateExpense, calculateExpenses, calculateStaffExpense, projectCounts } from './engine.js';
import { clone, number, uid } from './utils.js';

export const COHORTS = Object.freeze([
  { key: 'vulnerable', label: '취약 참여' },
  { key: 'regular', label: '비취약 참여' },
  { key: 'vulnerableAbsent', label: '취약 불참 고정비' },
  { key: 'regularAbsent', label: '비취약 불참 고정비' },
  { key: 'unclassified', label: '구분 미입력 비용' }
]);

const countFields = Object.freeze([
  'enrolled', 'notApplied', 'preContractCanceled', 'postContractCanceled', 'dayAbsent', 'chaperones',
  'vulnerableEnrolled', 'vulnerableNotApplied', 'vulnerablePreContractCanceled',
  'vulnerablePostContractCanceled', 'vulnerableDayAbsent', 'fixedCostAbsent'
]);

const count = value => Math.max(0, Math.floor(number(value)));
const won = value => Math.max(0, Math.round(number(value)));

export function summarizeAttendance(attendance = {}) {
  const values = Object.fromEntries(countFields.map(key => [key, count(attendance[key])]));
  const contractStudents = values.enrolled - values.notApplied - values.preContractCanceled;
  const participants = contractStudents - values.postContractCanceled - values.dayAbsent;
  const vulnerableContract = values.vulnerableEnrolled
    - values.vulnerableNotApplied - values.vulnerablePreContractCanceled;
  const vulnerableParticipants = vulnerableContract
    - values.vulnerablePostContractCanceled - values.vulnerableDayAbsent;
  const students = {
    enrolled: values.enrolled,
    applicants: values.enrolled - values.notApplied,
    contract: contractStudents,
    participants,
    vulnerableEnrolled: values.vulnerableEnrolled,
    vulnerableApplicants: values.vulnerableEnrolled - values.vulnerableNotApplied,
    vulnerableContract,
    vulnerableParticipants,
    regularParticipants: participants - vulnerableParticipants,
    vulnerableAbsent: values.vulnerablePostContractCanceled + values.vulnerableDayAbsent,
    regularAbsent: values.postContractCanceled + values.dayAbsent - values.vulnerableAbsent,
    fixedCostAbsent: values.fixedCostAbsent,
    chaperones: values.chaperones
  };
  const issues = [];
  for (const key of ['notApplied', 'preContractCanceled', 'postContractCanceled', 'dayAbsent']) {
    const max = key === 'notApplied' ? values.enrolled : key === 'preContractCanceled'
      ? values.enrolled - values.notApplied : key === 'postContractCanceled'
        ? contractStudents : contractStudents - values.postContractCanceled;
    if (values[key] > max) issues.push(`${key} 인원 ${values[key]}명이 가능한 인원 ${Math.max(0, max)}명을 초과합니다.`);
  }
  if (contractStudents < 0 || participants < 0) issues.push('신청·취소 인원으로 계산한 계약/참가 인원이 음수입니다. 인원별 단계를 확인해 주세요.');
  if (values.vulnerableEnrolled > values.enrolled) issues.push(`취약 재적 ${values.vulnerableEnrolled}명이 전체 재적 ${values.enrolled}명을 초과합니다.`);
  if (values.vulnerableNotApplied > values.notApplied) issues.push(`취약 미신청 ${values.vulnerableNotApplied}명이 전체 미신청 ${values.notApplied}명을 초과합니다.`);
  if (values.vulnerablePreContractCanceled > values.preContractCanceled) issues.push('취약 계약 전 취소 인원이 전체 계약 전 취소 인원보다 많습니다.');
  if (values.vulnerablePostContractCanceled > values.postContractCanceled) issues.push('취약 중도 취소 인원이 전체 중도 취소 인원보다 많습니다.');
  if (values.vulnerableDayAbsent > values.dayAbsent) issues.push('취약 당일 불참 인원이 전체 당일 불참 인원보다 많습니다.');
  if (vulnerableContract < 0 || vulnerableParticipants < 0 || students.regularParticipants < 0) {
    issues.push('취약 인원 단계가 음수가 되거나 전체 참가자보다 많습니다.');
  }
  if (values.fixedCostAbsent > values.postContractCanceled + values.dayAbsent) {
    issues.push(`고정비 부담 불참 ${values.fixedCostAbsent}명이 계약 후 불참 ${values.postContractCanceled + values.dayAbsent}명을 초과합니다.`);
  }
  return { ...students, values, issues };
}

function projectForAttendance(project, attendance, actual = false) {
  const a = summarizeAttendance(attendance);
  return {
    ...project,
    totalStudents: a.enrolled,
    actualParticipants: a.participants,
    absentStudents: Math.max(0, a.enrolled - a.participants),
    contractedAbsentStudents: a.vulnerableAbsent + a.regularAbsent,
    vulnerableContractedAbsent: a.vulnerableAbsent,
    regularContractedAbsent: a.regularAbsent,
    fixedCostAbsentStudents: a.fixedCostAbsent,
    vulnerableStudents: a.vulnerableEnrolled,
    vulnerableParticipants: a.vulnerableParticipants,
    vulnerableAbsent: a.vulnerableAbsent,
    chaperones: actual ? a.chaperones : count(project.chaperones)
  };
}

function legacyAttendance(project) {
  return {
    enrolled: count(project.totalStudents),
    notApplied: 0,
    preContractCanceled: 0,
    postContractCanceled: count(project.absentStudents),
    dayAbsent: 0,
    chaperones: count(project.chaperones),
    vulnerableEnrolled: count(project.vulnerableStudents),
    vulnerableNotApplied: 0,
    vulnerablePreContractCanceled: 0,
    vulnerablePostContractCanceled: count(project.vulnerableAbsent),
    vulnerableDayAbsent: 0,
    fixedCostAbsent: 0
  };
}

function hasAttendanceInput(value = {}) {
  return countFields.some(key => value[key] !== null && value[key] !== undefined && value[key] !== '' && count(value[key]) > 0);
}

function expenseCategory(expense) {
  return ['vehicle', 'lodging', 'meal', 'ticket', 'insurance', 'culture', 'other'].includes(expense.category)
    ? expense.category : 'other';
}

function makeExpenseBasis(project, basis) {
  const workflow = project.workflow ?? {};
  const configuredPlanAttendance = workflow.attendance ?? {};
  const planAttendance = hasAttendanceInput(configuredPlanAttendance) || count(project.totalStudents) === 0
    ? configuredPlanAttendance : legacyAttendance(project);
  const attendanceInput = basis === 'actual' ? workflow.actual?.attendance ?? {} : planAttendance;
  const missingAttendance = basis === 'actual'
    ? countFields.filter(key => attendanceInput[key] === null || attendanceInput[key] === undefined || attendanceInput[key] === '')
    : [];
  const attendance = basis === 'actual' && missingAttendance.length
    ? summarizeAttendance(planAttendance)
    : summarizeAttendance(attendanceInput);
  const actualCountIssues = basis === 'actual' && !missingAttendance.length ? attendance.issues : [];
  const effectiveAttendance = basis === 'actual' && missingAttendance.length
    ? planAttendance : attendanceInput;
  const baseProject = projectForAttendance(project, effectiveAttendance, basis === 'actual');
  const expenseSource = basis === 'actual'
    ? (project.expenses ?? []).filter(expense => expense.actualAmount !== null && expense.actualAmount !== undefined)
    : (project.expenses ?? []);
  const staffSource = basis === 'actual'
    ? (project.staffExpenses ?? []).filter(expense => expense.actualAmount !== null && expense.actualAmount !== undefined)
    : (project.staffExpenses ?? []);
  const missingExpenseIds = basis === 'actual'
    ? (project.expenses ?? []).filter(expense => expense.actualAmount === null || expense.actualAmount === undefined).map(expense => expense.id)
    : [];
  const missingStaffExpenseIds = basis === 'actual'
    ? (project.staffExpenses ?? []).filter(expense => expense.actualAmount === null || expense.actualAmount === undefined).map(expense => expense.id)
    : [];
  const actualProject = { ...baseProject, expenses: expenseSource, staffExpenses: staffSource };
  const expenseResult = calculateExpenses(actualProject, basis === 'actual');
  const refunds = basis === 'actual' ? workflow.actual?.refunds ?? {} : {};
  const adjustedRows = expenseResult.rows.map(row => {
    const refund = won(refunds[row.id]);
    const grossContractAmount = Math.round(row.total);
    if (refund > grossContractAmount) {
      return { ...row, total: 0, grossAmount: grossContractAmount, refundAmount: refund, studentTotal: 0, staffTotal: 0, cohortCosts: { vulnerable: 0, regular: 0, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 }, refundIssue: `${row.name || '비용 항목'} 환불액 ${refund.toLocaleString()}원이 총액 ${grossContractAmount.toLocaleString()}원을 초과합니다.` };
    }
    if (!refund) return { ...row, grossAmount: grossContractAmount, refundAmount: 0 };
    const netExpense = { ...row, actualAmount: Math.max(0, grossContractAmount - refund) };
    const recalculated = calculateExpense(netExpense, actualProject, true);
    return { ...recalculated, grossAmount: grossContractAmount, refundAmount: refund };
  });
  const actualStudentTotal = adjustedRows.reduce((sum, row) => sum + Math.round(row.studentTotal), 0);
  const staffRows = staffSource.map(expense => {
    const raw = calculateStaffExpense(expense, actualProject, basis === 'actual');
    const grossAmount = won(raw.total);
    const refundAmount = won(refunds[expense.id]);
    const net = Math.max(0, grossAmount - refundAmount);
    return { ...expense, total: net, grossAmount, refundAmount, refundIssue: refundAmount > grossAmount
      ? `${expense.name || '인솔자 비용'} 환불액이 실제 금액보다 ${(refundAmount - grossAmount).toLocaleString()}원 많습니다.` : null };
  });
  const staffTotal = staffRows.filter(row => row.costOwner !== 'operation').reduce((sum, row) => sum + row.total, 0)
    + adjustedRows.reduce((sum, row) => sum + row.staffTotal, 0);
  const operationTotal = staffRows.filter(row => row.costOwner === 'operation').reduce((sum, row) => sum + row.total, 0);
  return {
    project: actualProject,
    attendance,
    attendanceComplete: basis !== 'actual' || missingAttendance.length === 0,
    missingAttendance,
    attendanceIssues: basis === 'actual' && missingAttendance.length ? [] : actualCountIssues,
    rows: adjustedRows,
    studentTotal: actualStudentTotal,
    staffRows,
    staffTotal,
    operationTotal,
    eventTotal: actualStudentTotal + staffTotal + operationTotal,
    missingExpenseIds,
    missingStaffExpenseIds
  };
}

function eligibleForSource(source, expense, group) {
  if (!(source.eligibleGroups ?? []).includes(group)) return false;
  const categories = source.eligibleCategories ?? [];
  return categories.length === 0 || categories.includes(expenseCategory(expense));
}

function positiveGroups(source, attendance) {
  const a = attendance;
  return Object.fromEntries(COHORTS.map(({ key }) => [key,
    key === 'vulnerable' ? a.vulnerableParticipants
      : key === 'regular' ? a.regularParticipants
        : key === 'vulnerableAbsent' ? a.vulnerableAbsent
          : key === 'regularAbsent' ? a.regularAbsent
            : Math.max(0, a.fixedCostAbsent)
  ]));
}

function expenseGroupCounts(expense, project, attendance) {
  const a = attendance;
  if (expense.quantityBase === 'participantsPlusAbsent') {
    return { vulnerable: a.vulnerableParticipants, regular: a.regularParticipants, vulnerableAbsent: a.vulnerableAbsent, regularAbsent: a.regularAbsent, unclassified: 0 };
  }
  if (expense.quantityBase === 'totalStudents') {
    const known = a.participants + a.vulnerableAbsent + a.regularAbsent;
    return { vulnerable: a.vulnerableParticipants, regular: a.regularParticipants, vulnerableAbsent: a.vulnerableAbsent, regularAbsent: a.regularAbsent, unclassified: Math.max(0, a.enrolled - known) };
  }
  if (expense.quantityBase === 'custom') {
    const custom = expense.customCohorts;
    const sum = custom ? Object.values(custom).reduce((s, n) => s + count(n), 0) : 0;
    if (custom && sum === count(expense.customQuantity)) {
      return Object.fromEntries(COHORTS.map(({ key }) => [key, count(custom[key])]));
    }
    return { vulnerable: 0, regular: 0, vulnerableAbsent: 0, regularAbsent: 0, unclassified: count(expense.customQuantity) };
  }
  return { vulnerable: a.vulnerableParticipants, regular: a.regularParticipants, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 };
}

function sourceOrder(a, b) {
  return number(a.priority, 10) - number(b.priority, 10);
}

export function calculateWorkflow(project, school = {}, { basis = 'plan' } = {}) {
  const prepared = makeExpenseBasis(project, basis);
  const workflow = project.workflow ?? {};
  const sources = (workflow.resources ?? []).map((source, index) => ({ ...source, _index: index }))
    .sort((a, b) => sourceOrder(a, b) || a._index - b._index);
  const rowState = new Map(prepared.rows.map(row => [row.id, {
    row,
    remaining: Object.fromEntries(COHORTS.map(({ key }) => [key, won(row.cohortCosts[key])])),
    allocations: {}
  }]));
  const sourceState = new Map();
  const issues = [
    ...prepared.attendance.issues,
    ...prepared.attendanceIssues,
    ...prepared.rows.map(row => row.refundIssue).filter(Boolean),
    ...prepared.staffRows.map(row => row.refundIssue).filter(Boolean)
  ];
  const manualRows = workflow.manualAllocations ?? [];
  const schoolBudgetEntry = school.projectBudgets?.[project.id];
  const schoolCap = schoolBudgetEntry?.amount === null || schoolBudgetEntry?.amount === undefined
    ? Number.POSITIVE_INFINITY : won(schoolBudgetEntry.amount);
  let schoolRemaining = schoolCap;

  for (const source of sources) {
    const enteredActual = basis === 'actual' ? workflow.actual?.resourceAmounts?.[source.id] : null;
    const resourceBudget = enteredActual !== null && enteredActual !== undefined
      ? won(enteredActual)
      : source.issuedAmount === null || source.issuedAmount === undefined
        ? Number.POSITIVE_INFINITY : won(source.issuedAmount);
    let remaining = source.reportClass === 'school' ? Math.min(resourceBudget, schoolRemaining) : resourceBudget;
    const groupBudgets = {};
    for (const { key } of COHORTS) {
      const rate = source.limits?.[key];
      if (rate === null || rate === undefined) {
        groupBudgets[key] = Number.POSITIVE_INFINITY;
      } else {
        const eligibleQuantity = prepared.rows.reduce((max, row) => eligibleForSource(source, row, key)
          ? Math.max(max, expenseGroupCounts(row, prepared.project, prepared.attendance)[key]) : max, 0);
        groupBudgets[key] = won(rate) * eligibleQuantity;
      }
    }
    let used = 0;
    const perExpense = {};
    const distribute = (expenseId, group, requested, manual = false) => {
      const state = rowState.get(expenseId);
      if (!state) {
        if (manual) issues.push(`수동 배분에서 삭제되었거나 없는 비용 ID ${expenseId}를 참조합니다.`);
        return 0;
      }
      if (!eligibleForSource(source, state.row, group)) {
        if (manual) issues.push(`${state.row.name || '비용'} / ${source.name || '재원'}은 ${group} 대상 또는 허용 항목이 아닙니다.`);
        return 0;
      }
      const amount = Math.min(won(requested), state.remaining[group], remaining, groupBudgets[group]);
      if (manual && amount < won(requested)) {
        issues.push(`${state.row.name || '비용'} / ${source.name || '재원'} 수동 배분 ${won(requested).toLocaleString()}원 중 ${(won(requested) - amount).toLocaleString()}원을 적용하지 않았습니다. 항목 잔액·재원 한도·대상 한도를 확인해 주세요.`);
      }
      if (amount <= 0) return 0;
      state.remaining[group] -= amount;
      state.allocations[source.id] ??= {};
      state.allocations[source.id][group] = (state.allocations[source.id][group] ?? 0) + amount;
      perExpense[expenseId] ??= {};
      perExpense[expenseId][group] = (perExpense[expenseId][group] ?? 0) + amount;
      remaining -= amount;
      groupBudgets[group] -= amount;
      used += amount;
      return amount;
    };

    for (const manual of manualRows.filter(item => item.sourceId === source.id)) {
      distribute(manual.expenseId, manual.group, manual.amount, true);
    }
    for (const [expenseId, state] of rowState) {
      for (const { key } of COHORTS) {
        if (remaining <= 0) break;
        if (!eligibleForSource(source, state.row, key)) continue;
        const rate = source.limits?.[key];
        const maximum = rate === null || rate === undefined
          ? state.remaining[key]
          : Math.min(state.remaining[key], won(rate) * expenseGroupCounts(state.row, prepared.project, prepared.attendance)[key]);
        distribute(expenseId, key, maximum, false);
      }
      if (remaining <= 0) break;
    }
    if (enteredActual !== null && enteredActual !== undefined && used < won(enteredActual)) {
      issues.push(`${source.name || '재원'} 정산 배분 입력 ${won(enteredActual).toLocaleString()}원 중 적격 비용이 부족해 ${(won(enteredActual) - used).toLocaleString()}원을 배분하지 못했습니다.`);
    }
    sourceState.set(source.id, {
      id: source.id,
      name: source.name,
      reportClass: source.reportClass,
      returnRequired: Boolean(source.returnRequired),
      issuedAmount: source.issuedAmount,
      used,
      balance: source.issuedAmount === null || source.issuedAmount === undefined ? null : won(source.issuedAmount) - used,
      enteredActual: enteredActual === null || enteredActual === undefined ? null : won(enteredActual),
      allocations: perExpense
    });
    if (source.reportClass === 'school') schoolRemaining = Math.max(0, schoolRemaining - used);
  }

  const costAllocations = [...rowState.values()].map(state => {
    const remaining = Object.fromEntries(COHORTS.map(({ key }) => [key, state.remaining[key]]));
    const sourceAmounts = Object.fromEntries(Object.entries(state.allocations).map(([id, groups]) => [id,
      Object.values(groups).reduce((sum, amount) => sum + amount, 0)
    ]));
    const used = Object.values(sourceAmounts).reduce((sum, amount) => sum + amount, 0);
    const residual = Object.values(remaining).reduce((sum, amount) => sum + amount, 0);
    return {
      id: state.row.id,
      name: state.row.name,
      date: state.row.date,
      category: expenseCategory(state.row),
      studentCost: Math.round(state.row.studentTotal),
      contractAmount: Math.round(state.row.total),
      grossAmount: state.row.grossAmount,
      refundAmount: state.row.refundAmount,
      funded: used,
      student: residual,
      groups: Object.fromEntries(COHORTS.map(({ key }) => [key, {
        cost: won(state.row.cohortCosts[key]),
        remaining: remaining[key],
        allocations: Object.fromEntries(sources.map(source => [source.id, won(state.allocations[source.id]?.[key])]))
      }])),
      allocations: state.allocations,
      _row: state.row
    };
  });
  const resourceTotals = [...sourceState.values()];
  const classTotals = Object.fromEntries(['education', 'school', 'student', 'external'].map(reportClass => [
    reportClass,
    resourceTotals.filter(source => source.reportClass === reportClass).reduce((sum, source) => sum + source.used, 0)
  ]));
  const schoolUsed = classTotals.school;
  if (schoolUsed > schoolCap) issues.push(`학년 학교 예산 배정 ${schoolCap.toLocaleString()}원보다 ${schoolUsed.toLocaleString()}원을 ${ (schoolUsed - schoolCap).toLocaleString()}원 초과했습니다.`);
  const nonStudentSourceUsed = resourceTotals.filter(source => source.reportClass !== 'student')
    .reduce((sum, source) => sum + source.used, 0);
  const studentUsed = classTotals.student + costAllocations.reduce((sum, row) => sum + row.student, 0);
  const studentCost = prepared.studentTotal;
  if (studentUsed + nonStudentSourceUsed !== studentCost) {
    issues.push(`학생경비 ${studentCost.toLocaleString()}원과 재원 배분 합계 ${ (studentUsed + nonStudentSourceUsed).toLocaleString()}원이 일치하지 않습니다.`);
  }
  const studentSourceIds = new Set(resourceTotals.filter(source => source.reportClass === 'student').map(source => source.id));
  const regularStudentUsed = costAllocations.reduce((sum, row) => sum + row.groups.regular.remaining
    + Object.entries(row.groups.regular.allocations)
      .filter(([sourceId]) => studentSourceIds.has(sourceId))
      .reduce((groupSum, [, amount]) => groupSum + amount, 0), 0);
  const regularParticipants = prepared.attendance.regularParticipants;
  const regularBurden = regularParticipants > 0 ? regularStudentUsed / regularParticipants : 0;
  for (const source of resourceTotals) {
    if (source.balance !== null && source.balance < 0) issues.push(`${source.name} 교부/배정액을 ${Math.abs(source.balance).toLocaleString()}원 초과했습니다.`);
  }
  for (const manual of manualRows) {
    if (!sources.some(source => source.id === manual.sourceId)) issues.push(`수동 배분의 재원 ID ${manual.sourceId}가 없습니다.`);
  }
  const missingExpenseIds = basis === 'actual' ? prepared.missingExpenseIds : [];
  const missingStaffExpenseIds = basis === 'actual' ? prepared.missingStaffExpenseIds : [];
  const missingActual = basis === 'actual' && (
    !prepared.attendanceComplete || missingExpenseIds.length > 0 || missingStaffExpenseIds.length > 0
  );
  return {
    basis,
    project: prepared.project,
    attendance: prepared.attendance,
    attendanceComplete: prepared.attendanceComplete,
    missingAttendance: prepared.missingAttendance,
    rows: costAllocations,
    studentCost,
    studentUsed,
    staffTotal: prepared.staffTotal,
    operationTotal: prepared.operationTotal,
    eventTotal: prepared.eventTotal,
    resourceTotals,
    classTotals,
    educationUsed: classTotals.education,
    schoolUsed,
    externalUsed: classTotals.external,
    regularStudentUsed,
    regularBurden,
    missingExpenseIds,
    missingStaffExpenseIds,
    missingActual,
    issues: [...new Set(issues)],
    sourceState
  };
}

function splitLine(name, expenseId, sourceId, group, amount, quantity, sourceLabel, date, note) {
  const total = won(amount);
  const qty = count(quantity);
  if (!total) return [];
  const baseQty = Math.max(1, qty);
  const unit = Math.floor(total / baseQty);
  const extraPeople = total - unit * baseQty;
  const rows = [];
  if (baseQty - extraPeople > 0 && unit > 0) {
    rows.push({ expenseId, sourceId, group, name, date, source: sourceLabel, quantity: baseQty - extraPeople, unitAmount: unit, amount: unit * (baseQty - extraPeople), calculation: `${unit.toLocaleString()}원 × ${(baseQty - extraPeople).toLocaleString()}명`, note });
  }
  if (extraPeople > 0) {
    rows.push({ expenseId, sourceId, group, name, date, source: sourceLabel, quantity: extraPeople, unitAmount: unit + 1, amount: (unit + 1) * extraPeople, calculation: `${(unit + 1).toLocaleString()}원 × ${extraPeople.toLocaleString()}명`, note: `${note} · 정수 원 나머지` });
  }
  if (!rows.length) rows.push({ expenseId, sourceId, group, name, date, source: sourceLabel, quantity: baseQty, unitAmount: total, amount: total, calculation: `${total.toLocaleString()}원 총액`, note });
  return rows;
}

export function buildProposalLines(calculation, project) {
  const sourceById = new Map((project.workflow?.resources ?? []).map(source => [source.id, source]));
  const lines = [];
  for (const row of calculation.rows) {
    const sourceExpense = row._row;
    const quantities = expenseGroupCounts(sourceExpense, { ...calculation.project }, calculation.attendance);
    for (const cohort of COHORTS) {
      for (const [sourceId, amount] of Object.entries(row.groups[cohort.key].allocations)) {
        const source = sourceById.get(sourceId);
        if (!amount || !source) continue;
        lines.push(...splitLine(
          row.name, row.id, sourceId, cohort.key, amount, quantities[cohort.key], source.name,
          row.date, `${cohort.label} · ${source.reportClass}`
        ));
      }
      const residual = row.groups[cohort.key].remaining;
      if (residual) lines.push(...splitLine(
        row.name, row.id, 'student', cohort.key, residual, quantities[cohort.key], '학생 부담',
        row.date, cohort.label
      ));
    }
  }
  return lines;
}

export function reconcileAdministrativeEntries(project, plan, actual) {
  const entries = project.workflow?.administrativeEntries ?? [];
  const sourceReturnEntries = entries.filter(entry => entry.kind === 'refund' && entry.sourceId && !entry.expenseId);
  const result = [];
  const expenseIds = new Set([
    ...plan.rows.map(row => row.id),
    ...actual.rows.map(row => row.id)
  ]);
  for (const expenseId of expenseIds) {
    const plannedRow = plan.rows.find(row => row.id === expenseId);
    const actualRow = actual.rows.find(row => row.id === expenseId);
    const planned = plannedRow?.contractAmount ?? plannedRow?.studentCost ?? 0;
    const settled = actualRow?.contractAmount ?? actualRow?.studentCost ?? null;
    const linked = entries.filter(entry => entry.expenseId === expenseId);
    const commitments = linked.filter(entry => entry.kind === 'commitment' && entry.amount != null).reduce((sum, entry) => sum + won(entry.amount), 0);
    const payments = linked.filter(entry => entry.kind === 'payment' && entry.amount != null).reduce((sum, entry) => sum + won(entry.amount), 0);
    const refunds = linked.filter(entry => entry.kind === 'refund' && entry.amount != null).reduce((sum, entry) => sum + won(entry.amount), 0);
    const hasCommitment = linked.some(entry => entry.kind === 'commitment' && entry.amount != null);
    const hasPayment = linked.some(entry => (entry.kind === 'payment' || entry.kind === 'refund') && entry.amount != null);
    const incompleteEntry = linked.some(entry => entry.amount == null);
    result.push({
      expenseId,
      name: plan.rows.find(row => row.id === expenseId)?.name ?? actual.rows.find(row => row.id === expenseId)?.name ?? '',
      planned,
      committed: hasCommitment ? commitments : null,
      commitmentDifference: hasCommitment ? commitments - planned : null,
      grossPayments: hasPayment ? payments : null,
      refunds: hasPayment ? refunds : null,
      netPayments: hasPayment ? payments - refunds : null,
      actual: settled,
      paymentDifference: hasPayment && settled !== null ? payments - refunds - settled : null,
      status: incompleteEntry || !hasCommitment || (settled !== null && !hasPayment) || settled === null ? '미대조'
        : commitments > payments ? '일부 지급'
          : commitments !== planned || payments - refunds !== settled ? '차액 확인'
            : '대조 완료'
    });
  }
  const returnRows = (actual.resourceTotals ?? []).filter(source => source.returnRequired
    || sourceReturnEntries.some(entry => entry.sourceId === source.id)).map(source => {
    const linked = sourceReturnEntries.filter(entry => entry.sourceId === source.id);
    const hasAmount = linked.some(entry => entry.amount != null);
    const incomplete = linked.some(entry => entry.amount == null);
    const returned = hasAmount ? linked.reduce((sum, entry) => sum + (entry.amount == null ? 0 : won(entry.amount)), 0) : null;
    const expectedReturn = source.issuedAmount == null ? null : Math.max(0, won(source.issuedAmount) - source.used);
    const difference = expectedReturn === null || returned === null ? null : returned - expectedReturn;
    const status = actual.missingActual ? '정산 초안'
      : expectedReturn === null ? '교부액 미입력'
      : expectedReturn === 0 && !hasAmount && !incomplete ? '반납 없음'
        : incomplete || !hasAmount ? '미대조'
          : returned === expectedReturn ? '대조 완료' : '차액 확인';
    return { sourceId: source.id, name: source.name, expectedReturn, returned, difference, status };
  });
  const returnEntryIds = new Set(sourceReturnEntries.map(entry => entry.id));
  const orphanEntries = entries.filter(entry => !returnEntryIds.has(entry.id) && (!entry.expenseId || !expenseIds.has(entry.expenseId)));
  const returnUnreconciled = returnRows.some(row => !['대조 완료', '반납 없음'].includes(row.status));
  const status = result.length === 0 || result.some(row => row.status === '미대조') || orphanEntries.length || returnUnreconciled ? '미대조'
    : result.some(row => row.status === '차액 확인') ? '차액 확인'
      : result.some(row => row.status === '일부 지급') ? '일부 지급'
        : returnRows.some(row => row.status === '차액 확인') ? '차액 확인'
          : '대조 완료';
  return { rows: result, returnRows, orphanEntries, status };
}

export function createConfirmedPlanSnapshot(project, school, confirmedAt = new Date().toISOString()) {
  const calculation = calculateWorkflow(project, school);
  return {
    id: uid('plan'),
    confirmedAt,
    projectId: project.id,
    title: project.title,
    grade: project.grade,
    schoolYear: school.schoolYear,
    schoolBudget: clone(school.projectBudgets?.[project.id] ?? { amount: null, fixed: false, targetBurden: null }),
    business: {
      executionMode: project.executionMode,
      startDate: project.startDate,
      endDate: project.endDate,
      place: project.place,
      days: project.days
    },
    attendance: clone(calculation.attendance.values),
    attendanceSummary: {
      enrolled: calculation.attendance.enrolled,
      participants: calculation.attendance.participants,
      regularParticipants: calculation.attendance.regularParticipants,
      vulnerableParticipants: calculation.attendance.vulnerableParticipants
    },
    resources: clone(project.workflow?.resources ?? []),
    manualAllocations: clone(project.workflow?.manualAllocations ?? []),
    proposalReference: clone(project.workflow?.proposalReference ?? {}),
    expenses: clone(project.expenses ?? []),
    staffExpenses: clone(project.staffExpenses ?? []),
    calculations: {
      studentCost: calculation.studentCost,
      staffTotal: calculation.staffTotal,
      operationTotal: calculation.operationTotal,
      eventTotal: calculation.eventTotal,
      studentUsed: calculation.studentUsed,
      schoolBudgetAmount: school.projectBudgets?.[project.id]?.amount ?? null,
      participants: calculation.attendance.participants,
      resourceTotals: calculation.resourceTotals.map(source => ({ ...source })),
      regularBurden: calculation.regularBurden,
      allocations: calculation.rows.map(row => ({
        id: row.id,
        name: row.name,
        studentCost: row.studentCost,
        student: row.student,
      allocations: clone(row.allocations),
        contractAmount: row.contractAmount,
        groups: clone(row.groups)
      }))
    },
    proposalLines: buildProposalLines(calculation, project)
  };
}

export function compareConfirmedPlan(project, school) {
  const plan = project.workflow?.confirmedPlan;
  if (!plan) return { status: '확정 계획 없음', differences: [] };
  const actual = calculateWorkflow(project, school, { basis: 'actual' });
  const changes = [];
  const add = (label, before, after) => {
    if (before === null || before === undefined || after === null || after === undefined || before === after) return;
    changes.push({ label, before, after, difference: after - before });
  };
  const headcount = actual.attendance;
  if (actual.attendanceComplete) add('참여 인원', plan.attendanceSummary?.participants, headcount.participants);
  add('학생경비', plan.calculations.studentCost, actual.studentCost);
  add('행사 전체 비용', plan.calculations.eventTotal, actual.eventTotal);
  add('학생 부담', plan.calculations.studentUsed, actual.studentUsed);
  add('비취약 1인 부담', plan.calculations.regularBurden, actual.regularBurden);
  for (const old of plan.calculations.resourceTotals ?? []) {
    const next = actual.resourceTotals.find(row => row.id === old.id);
    if (next) add(`${old.name} 사용액`, old.used, next.used);
  }
  return { status: actual.missingActual ? '실적 초안' : '실적 입력 완료', differences: changes, actual };
}

function preSchoolRegularCosts(project, school) {
  const cloneProject = clone(project);
  cloneProject.workflow.resources = (cloneProject.workflow.resources ?? []).filter(source => source.reportClass !== 'school');
  const finance = calculateWorkflow(cloneProject, school);
  const eligibleByExpense = new Map();
  for (const row of finance.rows) {
    const expense = row._row;
    const hasSchoolSource = (project.workflow?.resources ?? []).some(source => source.reportClass === 'school'
      && eligibleForSource(source, expense, 'regular'));
    const remainingRegular = row.groups.regular.remaining;
    eligibleByExpense.set(row.id, {
      base: remainingRegular,
      eligible: hasSchoolSource ? remainingRegular : 0
    });
  }
  return {
    base: finance.regularStudentUsed,
    cap: [...eligibleByExpense.values()].reduce((sum, item) => sum + item.eligible, 0),
    people: finance.attendance.regularParticipants
  };
}

export function suggestSchoolBudgets(projects, school, fixedOverrides = {}) {
  const total = won(school.annualSchoolBudget);
  const items = projects.map(project => {
    const calc = preSchoolRegularCosts(project, school);
    const existing = school.projectBudgets?.[project.id] ?? {};
    return {
      project,
      base: calc.base,
      cap: calc.cap,
      people: calc.people,
      fixed: fixedOverrides[project.id]?.fixed ?? existing.fixed ?? false,
      fixedAmount: won(fixedOverrides[project.id]?.amount ?? existing.amount),
      targetBurden: fixedOverrides[project.id]?.targetBurden ?? existing.targetBurden ?? null
    };
  });
  let locked = items.filter(item => item.fixed);
  let open = items.filter(item => !item.fixed);
  let lockedTotal = locked.reduce((sum, item) => sum + Math.min(item.cap, item.fixedAmount), 0);
  let remaining = Math.max(0, total - lockedTotal);
  const targetSpecified = open.some(item => item.targetBurden !== null && item.targetBurden !== undefined && item.targetBurden !== '');
  let target = null;
  if (targetSpecified) {
    for (const item of open) {
      if (item.targetBurden !== null && item.targetBurden !== undefined && item.targetBurden !== '') {
        item.needed = Math.min(item.cap, Math.max(0, item.base - won(item.targetBurden) * item.people));
      } else {
        item.needed = item.base;
      }
    }
  } else if (open.length) {
    let low = 0;
    let high = Math.max(...open.map(item => item.people > 0 ? item.base / item.people : 0), 0);
    for (let i = 0; i < 48; i++) {
      const middle = (low + high) / 2;
      const need = open.reduce((sum, item) => sum + Math.min(item.cap, Math.max(0, item.base - Math.floor(middle * item.people))), 0);
      if (need > remaining) low = middle;
      else high = middle;
    }
    target = Math.floor(high);
    for (const item of open) item.needed = Math.min(item.cap, Math.max(0, item.base - target * item.people));
  }
  let suggestions = Object.fromEntries(locked.map(item => [item.project.id, Math.min(item.cap, item.fixedAmount)]));
  for (const item of open) suggestions[item.project.id] = Math.min(item.cap, item.needed ?? 0);
  let used = Object.values(suggestions).reduce((sum, amount) => sum + amount, 0);
  if (!targetSpecified && used < remaining + lockedTotal && open.length) {
    const order = [...open].sort((a, b) => (b.people ? b.base / b.people : 0) - (a.people ? a.base / a.people : 0));
    for (const item of order) {
      const room = Math.max(0, item.cap - suggestions[item.project.id]);
      const add = Math.min(room, total - used);
      suggestions[item.project.id] += add;
      used += add;
      if (used >= total) break;
    }
  }
  return {
    targetBurden: target,
    suggestions,
    used,
    unallocated: Math.max(0, total - used),
    shortfall: Math.max(
      Math.max(0, lockedTotal - total),
      targetSpecified ? Math.max(0, open.reduce((sum, item) => sum + (item.needed ?? 0), 0) - remaining) : 0
    ),
    rows: items.map(item => ({
      projectId: item.project.id,
      title: item.project.title,
      grade: item.project.grade,
      participants: item.people,
      baseStudentCost: item.base,
      eligibleSchoolCost: item.cap,
      suggested: suggestions[item.project.id] ?? 0,
      estimatedBurden: item.people > 0 ? Math.max(0, item.base - (suggestions[item.project.id] ?? 0)) / item.people : 0,
      fixed: item.fixed,
      targetBurden: item.targetBurden
    }))
  };
}
