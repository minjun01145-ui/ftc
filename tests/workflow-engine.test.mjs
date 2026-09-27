import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateExpense, calculateStaffExpense } from '../js/engine.js';
import { createExpense, createFundingSource, createProject, normalizeState } from '../js/presets.js';
import {
  buildProposalLines,
  calculateWorkflow,
  compareConfirmedPlan,
  createConfirmedPlanSnapshot,
  reconcileAdministrativeEntries,
  suggestSchoolBudgets
} from '../js/workflowEngine.js';

function attendance({ enrolled, notApplied = 0, postContractCanceled = 0, dayAbsent = 0, vulnerableEnrolled, vulnerablePostContractCanceled = 0, fixedCostAbsent = 0 }) {
  return {
    enrolled, notApplied, preContractCanceled: 0, postContractCanceled, dayAbsent, chaperones: 8,
    vulnerableEnrolled, vulnerableNotApplied: 0, vulnerablePreContractCanceled: 0,
    vulnerablePostContractCanceled, vulnerableDayAbsent: 0, fixedCostAbsent
  };
}

function exampleProject({ grade, enrolled, notApplied = 0, postContractCanceled = 0, vulnerableEnrolled, regularLimit, cultureAmount, generalSchoolAmount, grantAmount, fixedCostAbsent = 1 }) {
  const project = createProject(`${grade}학년 현장체험학습`);
  project.grade = grade;
  project.startDate = '2026-05-13';
  project.endDate = '2026-05-15';
  project.days = 3;
  project.executionMode = '숙박형';
  project.place = '서울';
  project.chaperones = 8;
  project.workflow.attendance = attendance({ enrolled, notApplied, postContractCanceled, vulnerableEnrolled, fixedCostAbsent });
  const regularParticipants = enrolled - notApplied - postContractCanceled - vulnerableEnrolled;
  const participants = enrolled - notApplied - postContractCanceled;
  const perPerson = grade === 1 || grade === 3 ? 123400 : 313500;
  const culturePerPerson = grade === 2 ? 18000 : 0;
  const expenses = [];
  if (culturePerPerson) expenses.push(createExpense({ id: `culture-${grade}`, name: '공연/문화체험', category: 'culture', unitAmount: culturePerPerson, actualAmount: culturePerPerson * participants }));
  expenses.push(createExpense({
    id: `general-${grade}`, name: '학생 일반경비', category: 'other', unitAmount: perPerson - culturePerPerson,
    actualAmount: (perPerson - culturePerPerson) * participants
  }));
  if (fixedCostAbsent) {
    expenses.push(createExpense({
      id: `absence-${grade}`, name: '불참 공통 고정비', category: 'vehicle', calcMethod: 'fixedStudent',
      quantityBase: 'custom', customQuantity: fixedCostAbsent,
      customCohorts: { vulnerable: 0, regular: 0, vulnerableAbsent: 0, regularAbsent: 0, unclassified: fixedCostAbsent },
      planAmount: grade === 2 ? 184900 : 113600,
      actualAmount: grade === 2 ? 184900 : 113600
    }));
  }
  project.expenses = expenses;
  const educationLimits = grade === 1
    ? { vulnerable: null, regular: 0, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 }
    : grade === 3
      ? { vulnerable: null, regular: regularLimit, vulnerableAbsent: 0, regularAbsent: 0, unclassified: null }
      : { vulnerable: null, regular: regularLimit, vulnerableAbsent: 0, regularAbsent: 0, unclassified: null };
  project.workflow.resources = [
    createFundingSource({
      id: `education-${grade}`, name: '교육청 지원금', reportClass: 'education', issuedAmount: grantAmount,
      priority: 10, eligibleGroups: grade === 1 ? ['vulnerable'] : ['vulnerable', 'regular', 'unclassified'],
      limits: educationLimits
    }),
    ...(cultureAmount ? [createFundingSource({
      id: `culture-school-${grade}`, name: '문화예술체험비', reportClass: 'school', issuedAmount: cultureAmount,
      priority: 5, eligibleGroups: ['regular'], eligibleCategories: ['culture'],
      limits: { vulnerable: 0, regular: null, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 }
    })] : []),
    ...(generalSchoolAmount ? [createFundingSource({
      id: `school-general-${grade}`, name: '학교 자체지원', reportClass: 'school', issuedAmount: generalSchoolAmount,
      priority: 30, eligibleGroups: ['regular'],
      limits: { vulnerable: 0, regular: null, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 }
    })] : [])
  ];
  return project;
}

function twoYearProject() {
  const project = exampleProject({
    grade: 2, enrolled: 71, postContractCanceled: 1, vulnerableEnrolled: 17,
    regularLimit: 220000, cultureAmount: 954000, generalSchoolAmount: 1722500,
    grantAmount: 20360000
  });
  project.workflow.actual.attendance = attendance({
    enrolled: 72, notApplied: 1, postContractCanceled: 1, vulnerableEnrolled: 18, fixedCostAbsent: 1
  });
  project.workflow.actual.resourceAmounts = {
    [`culture-school-${project.grade}`]: 936000,
    [`school-general-${project.grade}`]: 1690000
  };
  return project;
}

function schoolFor(project, amount) {
  return {
    name: '익명 학교', schoolYear: 2026, annualSchoolBudget: amount,
    projectBudgets: { [project.id]: { amount, fixed: false, targetBurden: null } }
  };
}

test('2학년 계획과 정산 사례에서 취약·비취약·불참 재원과 학교 부담을 재현한다', () => {
  const project = twoYearProject();
  const school = schoolFor(project, 2676500);
  const plan = calculateWorkflow(project, school);
  const actual = calculateWorkflow(project, school, { basis: 'actual' });

  assert.equal(plan.attendance.participants, 70);
  assert.equal(plan.attendance.vulnerableParticipants, 17);
  assert.equal(plan.attendance.regularParticipants, 53);
  assert.equal(plan.studentCost, 22129900);
  assert.equal(plan.educationUsed, 17174400);
  assert.equal(plan.schoolUsed, 2676500);
  assert.equal(plan.studentUsed, 2279000);
  assert.equal(plan.eventTotal, 22129900);
  assert.equal(actual.attendance.enrolled, 72);
  assert.equal(actual.attendance.participants, 70);
  assert.equal(actual.attendance.vulnerableParticipants, 18);
  assert.equal(actual.attendance.regularParticipants, 52);
  assert.equal(actual.educationUsed, 17267900);
  assert.equal(actual.schoolUsed, 2626000);
  assert.equal(actual.studentUsed, 2236000);
  assert.equal(actual.studentCost, 22129900);
  assert.equal(actual.issues.length, 0);
});

test('품의용 분할 행은 학생 비용 행을 늘리지 않고 단가×정수 수량 합계를 보존한다', () => {
  const project = twoYearProject();
  const plan = calculateWorkflow(project, schoolFor(project, 2676500));
  const lines = buildProposalLines(plan, project);
  const sum = lines.reduce((total, line) => total + line.amount, 0);
  assert.equal(sum, plan.studentCost);
  for (const line of lines) assert.equal(line.quantity * line.unitAmount, line.amount);
  const sourceLines = lines.filter(line => line.expenseId === 'culture-2');
  assert.ok(sourceLines.some(line => line.source === '교육청 지원금'));
  assert.ok(sourceLines.some(line => line.source === '문화예술체험비'));
});

test('학년별 정책 차이와 계약 후 불참 고정비를 분리해 계산한다', () => {
  const grade1 = exampleProject({ grade: 1, enrolled: 48, vulnerableEnrolled: 8, regularLimit: 0, cultureAmount: 0, generalSchoolAmount: 3256000, grantAmount: 2465000, fixedCostAbsent: 0 });
  grade1.workflow.attendance.chaperones = 0;
  const first = calculateWorkflow(grade1, schoolFor(grade1, 3256000));
  assert.equal(first.studentCost, 5923200);
  assert.equal(first.educationUsed, 987200);
  assert.equal(first.schoolUsed, 3256000);
  assert.equal(first.studentUsed, 1680000);
  assert.equal(first.resourceTotals.find(row => row.reportClass === 'education').balance, 1477800);

  const grade3 = exampleProject({ grade: 3, enrolled: 60, postContractCanceled: 2, vulnerableEnrolled: 10, regularLimit: 120000, cultureAmount: 0, generalSchoolAmount: 0, grantAmount: 8425000, fixedCostAbsent: 2 });
  const third = calculateWorkflow(grade3, schoolFor(grade3, 0));
  assert.equal(third.attendance.participants, 58);
  assert.equal(third.educationUsed, 7107600);
  assert.equal(third.studentUsed, 163200);
  assert.equal(third.studentCost, 7270800);
  assert.equal(third.resourceTotals.find(row => row.reportClass === 'education').balance, 1317400);
});

test('목적 제한 재원은 허용 항목에만 쓰고 예산 부족을 학생 잔액에 드러낸다', () => {
  const project = twoYearProject();
  project.workflow.resources = project.workflow.resources.map(source => source.id === 'culture-school-2'
    ? { ...source, eligibleCategories: ['meal'] }
    : source);
  const result = calculateWorkflow(project, schoolFor(project, 2676500));
  assert.equal(result.resourceTotals.find(row => row.id === 'culture-school-2').used, 0);
  assert.equal(result.studentUsed, 3233000);

  const scarce = exampleProject({ grade: 1, enrolled: 48, vulnerableEnrolled: 8, regularLimit: 0, cultureAmount: 0, generalSchoolAmount: 100000, grantAmount: 100000 });
  const short = calculateWorkflow(scarce, schoolFor(scarce, 100000));
  assert.equal(short.studentUsed, 5836800);
  assert.equal(short.educationUsed + short.schoolUsed + short.studentUsed, short.studentCost);
});

test('0원 참여는 행사를 0원으로 계산하고 인솔자 없는 공통계약 나머지를 가상 비용으로 만들지 않는다', () => {
  const project = createProject('0명 일정');
  project.workflow.attendance.chaperones = 0;
  project.expenses = [createExpense({
    id: 'shared-zero-staff', name: '차량', calcMethod: 'sharedFixed', quantityBase: 'participants',
    planAmount: 101, rounding: 'floor10'
  })];
  const zero = calculateExpense(project.expenses[0], project);
  assert.equal(zero.studentTotal, 101);
  assert.equal(zero.staffTotal, 0);
  assert.equal(zero.cohortCosts.unclassified, 101);

  project.expenses[0].planAmount = 0;
  assert.equal(calculateWorkflow(project).studentCost, 0);
});

test('직접 입력한 집단 수는 비율로 쪼개지 않고 정수 원 나머지를 보존한다', () => {
  const project = createProject('직접 수량');
  project.totalStudents = 3;
  project.actualParticipants = 3;
  project.expenses = [createExpense({
    calcMethod: 'fixedStudent', quantityBase: 'custom', customQuantity: 3,
    customCohorts: { vulnerable: 1, regular: 1, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 1 },
    planAmount: 10
  })];
  const result = calculateExpense(project.expenses[0], project);
  assert.deepEqual(result.cohortCosts, { vulnerable: 4, regular: 3, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 3 });
  assert.equal(Object.values(result.cohortCosts).reduce((sum, value) => sum + value, 0), 10);
});

test('유료 인솔자 수를 전원 수와 구분해 계산한다', () => {
  const project = createProject('유료 인솔자');
  project.chaperones = 8;
  const row = createExpense({ calcMethod: 'perPerson', unitAmount: 30000, paidStaffCount: 1 });
  assert.equal(calculateStaffExpense(row, project).total, 30000);
});

test('실제 집행 미입력과 실제 0원을 구분하고 환불은 순집행에서 뺀다', () => {
  const project = exampleProject({ grade: 1, enrolled: 2, vulnerableEnrolled: 0, regularLimit: 0, cultureAmount: 0, generalSchoolAmount: 0, grantAmount: 0, fixedCostAbsent: 0 });
  project.workflow.attendance = attendance({ enrolled: 2, vulnerableEnrolled: 0, fixedCostAbsent: 0 });
  project.workflow.actual.attendance = attendance({ enrolled: 2, vulnerableEnrolled: 0, fixedCostAbsent: 0 });
  const actualRow = project.expenses[0];
  actualRow.actualAmount = null;
  let result = calculateWorkflow(project, {}, { basis: 'actual' });
  assert.equal(result.missingActual, true);
  assert.equal(result.rows.length, 0);
  actualRow.actualAmount = 0;
  result = calculateWorkflow(project, {}, { basis: 'actual' });
  assert.equal(result.missingActual, false);
  assert.equal(result.studentCost, 0);

  actualRow.actualAmount = 100;
  project.workflow.actual.refunds[actualRow.id] = 25;
  result = calculateWorkflow(project, {}, { basis: 'actual' });
  assert.equal(result.rows[0].grossAmount, 100);
  assert.equal(result.rows[0].refundAmount, 25);
  assert.equal(result.studentCost, 75);
});

test('수동 배분은 재계산 뒤에도 유지되고 재원/항목 한도 위반을 보여준다', () => {
  const project = exampleProject({ grade: 1, enrolled: 2, vulnerableEnrolled: 0, regularLimit: 0, cultureAmount: 0, generalSchoolAmount: 0, grantAmount: 0, fixedCostAbsent: 0 });
  project.workflow.resources = [createFundingSource({ id: 'external-small', name: '작은 외부 재원', reportClass: 'external', issuedAmount: 50, eligibleGroups: ['regular'], limits: { vulnerable: 0, regular: null, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 } })];
  project.workflow.manualAllocations = [{ id: 'manual-one', expenseId: project.expenses[0].id, sourceId: 'external-small', group: 'regular', amount: 100, reason: '수기 조정' }];
  const result = calculateWorkflow(project);
  assert.equal(project.workflow.manualAllocations[0].amount, 100);
  assert.equal(result.resourceTotals[0].used, 50);
  assert.ok(result.issues.some(issue => issue.includes('수동 배분')));
});

test('행정실 원인행위·지급은 독립 입력이고 일부 지급, 미대조, 차액을 구별한다', () => {
  const project = twoYearProject();
  const school = schoolFor(project, 2676500);
  const plan = calculateWorkflow(project, school);
  const actual = calculateWorkflow(project, school, { basis: 'actual' });
  let result = reconcileAdministrativeEntries(project, plan, actual);
  assert.equal(result.status, '미대조');
  const expenseId = project.expenses[0].id;
  project.workflow.administrativeEntries = [
    { id: 'obligation', kind: 'commitment', expenseId, amount: 1000 },
    { id: 'part-payment', kind: 'payment', expenseId, amount: 400 }
  ];
  result = reconcileAdministrativeEntries(project, plan, actual);
  assert.equal(result.rows.find(row => row.expenseId === expenseId).status, '일부 지급');
  project.workflow.administrativeEntries[0].amount = plan.rows.find(row => row.id === expenseId).studentCost + 1;
  project.workflow.administrativeEntries[1].amount = 50000000;
  result = reconcileAdministrativeEntries(project, plan, actual);
  assert.equal(result.rows.find(row => row.expenseId === expenseId).status, '차액 확인');
});

test('공통 계약 환불은 계약 전체와 학생·인솔자 순부담을 다시 계산하고 지급대조에 반영한다', () => {
  const project = createProject('공통 계약 환불');
  project.workflow.attendance = { ...attendance({ enrolled: 2, vulnerableEnrolled: 0, fixedCostAbsent: 0 }), chaperones: 1 };
  project.chaperones = 1;
  const expense = createExpense({
    id: 'shared-refund', name: '버스', category: 'vehicle', calcMethod: 'sharedFixed',
    quantityBase: 'participants', planAmount: 1001, actualAmount: 1001
  });
  project.expenses = [expense];
  project.workflow.actual.attendance = { ...attendance({ enrolled: 2, vulnerableEnrolled: 0, fixedCostAbsent: 0 }), chaperones: 1 };
  project.workflow.actual.refunds[expense.id] = 100;
  project.workflow.administrativeEntries = [
    { id: 'commitment', kind: 'commitment', expenseId: expense.id, amount: 1001 },
    { id: 'payment', kind: 'payment', expenseId: expense.id, amount: 1001 },
    { id: 'refund', kind: 'refund', expenseId: expense.id, amount: 100 }
  ];
  const plan = calculateWorkflow(project);
  const actual = calculateWorkflow(project, {}, { basis: 'actual' });
  assert.equal(actual.rows[0].grossAmount, 1001);
  assert.equal(actual.rows[0].contractAmount, 901);
  assert.equal(actual.rows[0].studentCost, 600);
  assert.equal(actual.eventTotal, 901);
  const result = reconcileAdministrativeEntries(project, plan, actual);
  assert.equal(result.rows[0].planned, 1001);
  assert.equal(result.rows[0].netPayments, 901);
  assert.equal(result.rows[0].actual, 901);
  assert.equal(result.rows[0].status, '대조 완료');
});

test('지원금 잔액은 산출 반납액과 행정실 실제 반납액을 독립 대조한다', () => {
  const project = createProject('지원금 반납');
  project.workflow.attendance = attendance({ enrolled: 1, vulnerableEnrolled: 0, fixedCostAbsent: 0 });
  const expense = createExpense({ id: 'trip', name: '입장료', unitAmount: 100, actualAmount: 100 });
  project.expenses = [expense];
  project.workflow.actual.attendance = attendance({ enrolled: 1, vulnerableEnrolled: 0, fixedCostAbsent: 0 });
  const source = createFundingSource({ id: 'grant', name: '교육청 지원금', reportClass: 'education', issuedAmount: 200, eligibleGroups: ['regular'], limits: { vulnerable: 0, regular: null, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 } });
  project.workflow.resources = [source];
  project.workflow.administrativeEntries = [
    { id: 'commitment', kind: 'commitment', expenseId: expense.id, sourceId: source.id, amount: 100 },
    { id: 'payment', kind: 'payment', expenseId: expense.id, sourceId: source.id, amount: 100 },
    { id: 'return', kind: 'refund', expenseId: '', sourceId: source.id, amount: 100 }
  ];
  const plan = calculateWorkflow(project);
  const actual = calculateWorkflow(project, {}, { basis: 'actual' });
  let result = reconcileAdministrativeEntries(project, plan, actual);
  assert.equal(result.returnRows[0].expectedReturn, 100);
  assert.equal(result.returnRows[0].returned, 100);
  assert.equal(result.returnRows[0].status, '대조 완료');
  assert.equal(result.status, '대조 완료');
  project.workflow.administrativeEntries[2].amount = 99;
  result = reconcileAdministrativeEntries(project, plan, actual);
  assert.equal(result.returnRows[0].difference, -1);
  assert.equal(result.returnRows[0].status, '차액 확인');
});

test('확정 계획은 실제 인원 변경과 정산 뒤에도 스냅샷 값으로 남는다', () => {
  const project = twoYearProject();
  const school = schoolFor(project, 2676500);
  const snapshot = createConfirmedPlanSnapshot(project, school, '2026-02-20T00:00:00.000Z');
  assert.equal(snapshot.schoolBudget.amount, 2676500);
  assert.equal(snapshot.calculations.schoolBudgetAmount, 2676500);
  project.workflow.confirmedPlan = snapshot;
  project.workflow.confirmedPlans = [snapshot];
  project.workflow.actual.attendance = attendance({ enrolled: 72, notApplied: 1, postContractCanceled: 1, vulnerableEnrolled: 18, fixedCostAbsent: 1 });
  const comparison = compareConfirmedPlan(project, school);
  assert.equal(snapshot.calculations.studentCost, 22129900);
  assert.equal(comparison.status, '실적 입력 완료');
  assert.ok(comparison.differences.some(row => row.label === '교육청 지원금 사용액' && row.difference === 93500));
  assert.ok(comparison.differences.some(row => row.label === '문화예술체험비 사용액' && row.difference === -18000));
  assert.ok(comparison.differences.some(row => row.label === '학교 자체지원 사용액' && row.difference === -32500));
  assert.ok(comparison.differences.some(row => row.label === '학생 부담' && row.difference === -43000));
  assert.equal(project.workflow.confirmedPlans[0].calculations.studentCost, 22129900);
});

test('학년별 학교 예산 제안은 고정 배정과 목표 부담을 존중하고 미배정 잔액을 계산한다', () => {
  const g1 = exampleProject({ grade: 1, enrolled: 10, vulnerableEnrolled: 0, regularLimit: 0, cultureAmount: 0, generalSchoolAmount: 1000000, grantAmount: 0, fixedCostAbsent: 0 });
  const g2 = exampleProject({ grade: 2, enrolled: 10, vulnerableEnrolled: 0, regularLimit: 0, cultureAmount: 0, generalSchoolAmount: 1000000, grantAmount: 0, fixedCostAbsent: 0 });
  g1.workflow.resources[0].eligibleGroups = [];
  g2.workflow.resources[0].eligibleGroups = [];
  const school = { annualSchoolBudget: 500000, projectBudgets: { [g1.id]: { amount: 100000, fixed: true }, [g2.id]: { amount: 0, fixed: false } } };
  const result = suggestSchoolBudgets([g1, g2], school);
  assert.equal(result.suggestions[g1.id], 100000);
  assert.ok(result.suggestions[g2.id] <= 400000);
  assert.equal(result.used + result.unallocated, 500000);
});

test('학생 부담으로 분류한 재원은 보고 합계와 비취약 부담에 포함된다', () => {
  const project = createProject('학생 부담 재원');
  project.workflow.attendance = attendance({ enrolled: 2, vulnerableEnrolled: 0, fixedCostAbsent: 0 });
  project.expenses = [createExpense({ id: 'ticket', name: '관람권', unitAmount: 10000 })];
  project.workflow.resources = [createFundingSource({
    id: 'student-charge', name: '학생 납부금', reportClass: 'student', issuedAmount: 12000,
    eligibleGroups: ['regular'],
    limits: { vulnerable: 0, regular: null, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 }
  })];

  const result = calculateWorkflow(project);
  const lines = buildProposalLines(result, project);
  assert.equal(result.classTotals.student, 12000);
  assert.equal(result.studentUsed, 20000);
  assert.equal(result.regularStudentUsed, 20000);
  assert.equal(result.regularBurden, 10000);
  assert.equal(result.issues.length, 0);
  assert.equal(lines.reduce((sum, row) => sum + row.amount, 0), result.studentCost);
  assert.equal(lines.find(row => row.source === '학생 납부금').amount, 12000);
});

test('schema v4 JSON은 스키마 v5로 인원과 안정적 ID를 보완하고 기존 실적은 미입력으로 둔다', () => {
  const old = normalizeState({ schemaVersion: 4, school: {}, projects: [{
    id: 'legacy-p', title: '이전 사업', totalStudents: 10, actualParticipants: 9, absentStudents: 1,
    expenses: [{ id: 'legacy-e', name: '버스', planAmount: 1000, actualAmount: null }]
  }] });
  assert.equal(old.schemaVersion, 5);
  assert.equal(old.projects[0].workflow.attendance.enrolled, 10);
  assert.equal(old.projects[0].expenses[0].id, 'legacy-e');
  assert.equal(old.projects[0].expenses[0].actualAmount, null);
  assert.equal(old.projects[0].workflow.resources[0].id, 'education-legacy-p');
});
