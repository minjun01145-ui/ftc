import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCostMethod, costInputAmount, costMethodOf, costMethodOptions } from '../js/costMethods.js';
import { calculateExpenses } from '../js/engine.js';
import { FIXED_COST_ITEMS, fixedCostBreakdown, fixedCostExpenses, normalizeFixedCosts } from '../js/fixedCosts.js';
import { createExpense, createProject, normalizeState } from '../js/presets.js';
import { cloneExpensesForStaff } from '../js/views/expenseTable.js';

const item = key => FIXED_COST_ITEMS.find(entry => entry.key === key);
const counts = { participants: 70, dayAbsent: 1, chaperones: 8 };

test('기타비는 모두 1인당/전체 계약액을 고를 수 있고, 인솔자 분담 값이 없으면 항목 기본값을 쓴다', () => {
  const normalized = normalizeFixedCosts({
    bus: { mode: 'perPerson', amount: 120000 },
    lodging: { mode: 'total', amount: '1400000', memo: '2박', includeChaperones: true },
    insurance: { mode: 'weird', amount: -5 }
  });
  assert.deepEqual(normalized, {
    bus: { mode: 'perPerson', amount: 120000, includeChaperones: true, memo: '' },
    lodging: { mode: 'total', amount: 1400000, includeChaperones: true, memo: '2박' },
    insurance: { mode: 'perPerson', amount: 0, includeChaperones: false, memo: '' }
  });
});

test('전체 계약액은 "인솔자도 함께 부담"이면 학생+인솔자, 아니면 학생 수로 나누고 10원 미만을 버린다', () => {
  const options = { dayAbsentSharesCommonCost: true };
  const withStaff = fixedCostBreakdown(item('bus'), { mode: 'total', amount: 9_000_000, includeChaperones: true }, counts, options);
  assert.equal(withStaff.divisor, 79);
  assert.equal(withStaff.perPerson, 113920);
  assert.equal(withStaff.studentTotal, 8_088_320);
  assert.equal(withStaff.remainder, 911_680);

  const studentsOnly = fixedCostBreakdown(item('bus'), { mode: 'total', amount: 9_000_000, includeChaperones: false }, counts, options);
  assert.equal(studentsOnly.divisor, 71);
  assert.equal(studentsOnly.perPerson, 126760);

  const perPerson = fixedCostBreakdown(item('bus'), { mode: 'perPerson', amount: 110000, includeChaperones: true }, counts, options);
  assert.equal(perPerson.perPerson, 110000);
  assert.equal(perPerson.students, 71);
});

test('당일 불참자 공통비용 부담을 끄면 버스비·숙소비는 실제 참여자만 나눈다', () => {
  const lodging = fixedCostBreakdown(item('lodging'), { mode: 'total', amount: 5_039_580 }, counts, { dayAbsentSharesCommonCost: false });
  assert.equal(lodging.students, 70);
  assert.equal(lodging.perPerson, 71990);
  const insurance = fixedCostBreakdown(item('insurance'), { mode: 'perPerson', amount: 1600 }, counts, { dayAbsentSharesCommonCost: true });
  assert.equal(insurance.students, 70, '보험비는 공통비용이 아니다');
});

test('입력한 기타비는 체험처 비용 뒤에 붙어 학생 비용 합계에 들어간다', () => {
  const project = createProject();
  Object.assign(project, { totalStudents: 70, actualParticipants: 70 });
  project.fixedCosts = {
    bus: { mode: 'total', amount: 700000, includeChaperones: false },
    lodging: { mode: 'total', amount: 1400000 },
    insurance: { mode: 'perPerson', amount: 1600 }
  };
  project.expenses = [{ ...createExpense({ id: 'ticket' }), unitAmount: 30000 }];

  assert.deepEqual(fixedCostExpenses(project, { participants: 70, dayAbsent: 0, chaperones: 0 }).map(entry => entry.name), ['버스비', '숙소비', '보험비']);
  const result = calculateExpenses(project);
  assert.deepEqual(result.rows.map(row => row.id), ['ticket', 'fixed-bus', 'fixed-lodging', 'fixed-insurance']);
  assert.equal(result.studentTotal, 700000 + 1400000 + 1600 * 70 + 30000 * 70);
});

test('금액이 0인 기타비는 비용 항목을 만들지 않고 기존 데이터에는 기본값을 채운다', () => {
  assert.deepEqual(fixedCostExpenses(createProject(), counts), []);
  const state = normalizeState({ school: {}, projects: [{ title: '기존', schoolSupport: { mode: 'perPersonRegular', amount: 32500 } }] });
  assert.deepEqual(state.projects[0].fixedCosts.bus, { mode: 'total', amount: 0, includeChaperones: true, memo: '' });
  assert.equal(state.projects[0].dayAbsentSharesCommonCost, false);
  assert.equal(state.projects[0].otherSupports[0].name, '학교 자체지원금');
});

test('학생용 계산방법은 단가 하나로 1인당/학생 총액을 구분하고 예전 항목은 보존한다', () => {
  const perPerson = applyCostMethod('student', createExpense(), 'perParticipant', '15000');
  assert.equal(perPerson.quantityBase, 'participants');
  assert.equal(perPerson.unitAmount, 15000);

  const studentTotal = applyCostMethod('student', perPerson, 'studentTotal', '15000');
  assert.equal(studentTotal.quantityBase, 'participantsPlusAbsent');
  assert.equal(costMethodOf('student', studentTotal), 'studentTotal');

  const legacy = createExpense({ calcMethod: 'sharedFixed', planAmount: 9000000 });
  assert.equal(costMethodOf('student', legacy), 'legacy');
  assert.equal(costInputAmount('student', legacy), 9000000);
  const kept = applyCostMethod('student', legacy, 'legacy', '8000000');
  assert.equal(kept.calcMethod, 'sharedFixed');
  assert.equal(kept.planAmount, 8000000);
});

test('인솔자용 표는 학생용과 같은 모양이고, 붙여넣기하면 단가가 그대로 복사된다', () => {
  assert.deepEqual(costMethodOptions('staff', createExpense()).map(option => option.label), ['1인당 금액', '총액']);
  const student = [
    applyCostMethod('student', createExpense({ name: '롯데월드' }), 'studentTotal', 30000),
    createExpense({ name: '예전 버스', calcMethod: 'sharedFixed', planAmount: 9000000 })
  ];
  const staff = cloneExpensesForStaff(student);
  assert.equal(costMethodOf('staff', staff[0]), 'perStaff');
  assert.equal(costInputAmount('staff', staff[0]), 30000);
  assert.equal(staff[0].name, '롯데월드');
  assert.notEqual(staff[0].id, student[0].id);
  assert.equal(costMethodOf('staff', staff[1]), 'legacy');

  const total = applyCostMethod('staff', staff[0], 'staffTotal', 160000);
  assert.equal(total.calcMethod, 'fixedStudent');
  assert.equal(total.planAmount, 160000);
});
