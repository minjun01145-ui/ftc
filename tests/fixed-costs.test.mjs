import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpenses } from '../js/engine.js';
import { FIXED_COST_ITEMS, fixedCostBreakdown, fixedCostExpenses, normalizeFixedCosts } from '../js/fixedCosts.js';
import { createExpense, createProject, normalizeState } from '../js/presets.js';
import { applyStudentCostMethod, studentCostInputAmount, studentCostMethodOf } from '../js/studentCostMethod.js';

const item = key => FIXED_COST_ITEMS.find(entry => entry.key === key);
const counts = { participants: 70, dayAbsent: 1, chaperones: 8 };

test('버스비는 전체 계약액만, 숙소·보험비는 1인당/전체 계약액을 고를 수 있다', () => {
  const normalized = normalizeFixedCosts({
    bus: { mode: 'perPerson', amount: 900000 },
    lodging: { mode: 'total', amount: '1400000', memo: '2박' },
    insurance: { mode: 'weird', amount: -5 }
  });
  assert.deepEqual(normalized, {
    bus: { mode: 'total', amount: 900000, memo: '' },
    lodging: { mode: 'total', amount: 1400000, memo: '2박' },
    insurance: { mode: 'perPerson', amount: 0, memo: '' }
  });
});

test('버스비 전체 계약액은 학생과 인솔자 수로 나누고 10원 미만을 버린다', () => {
  const bus = fixedCostBreakdown(item('bus'), { mode: 'total', amount: 9_000_000 }, counts, { dayAbsentSharesCommonCost: true });
  assert.equal(bus.divisor, 79);
  assert.equal(bus.perPerson, 113920);
  assert.equal(bus.students, 71);
  assert.equal(bus.studentTotal, 8_088_320);
  assert.equal(bus.remainder, 911_680);
});

test('당일 불참자 공통비용 부담을 끄면 버스비·숙소비는 실제 참여자만 나눈다', () => {
  const lodging = fixedCostBreakdown(item('lodging'), { mode: 'total', amount: 5_039_580 }, counts, { dayAbsentSharesCommonCost: false });
  assert.equal(lodging.students, 70);
  assert.equal(lodging.perPerson, 71990);
  const insurance = fixedCostBreakdown(item('insurance'), { mode: 'perPerson', amount: 1600 }, counts, { dayAbsentSharesCommonCost: true });
  assert.equal(insurance.students, 70, '보험비는 공통비용이 아니다');
});

test('입력한 고정비는 체험처 비용 뒤에 붙어 학생 비용 합계에 들어간다', () => {
  const project = createProject();
  Object.assign(project, { totalStudents: 70, actualParticipants: 70 });
  project.fixedCosts = {
    bus: { mode: 'total', amount: 700000 },
    lodging: { mode: 'total', amount: 1400000 },
    insurance: { mode: 'perPerson', amount: 1600 }
  };
  project.expenses = [{ ...createExpense({ id: 'ticket' }), unitAmount: 30000 }];

  assert.deepEqual(fixedCostExpenses(project, { participants: 70, dayAbsent: 0, chaperones: 0 }).map(entry => entry.name), ['버스비', '숙소비', '보험비']);
  const result = calculateExpenses(project);
  assert.deepEqual(result.rows.map(row => row.id), ['ticket', 'fixed-bus', 'fixed-lodging', 'fixed-insurance']);
  assert.equal(result.studentTotal, 700000 + 1400000 + 1600 * 70 + 30000 * 70);
});

test('금액이 0인 고정비는 비용 항목을 만들지 않고 기존 데이터에는 기본값을 채운다', () => {
  assert.deepEqual(fixedCostExpenses(createProject(), counts), []);
  const state = normalizeState({ school: {}, projects: [{ title: '기존', schoolSupport: { mode: 'perPersonRegular', amount: 32500 } }] });
  assert.deepEqual(state.projects[0].fixedCosts.bus, { mode: 'total', amount: 0, memo: '' });
  assert.equal(state.projects[0].dayAbsentSharesCommonCost, false);
  assert.equal(state.projects[0].otherSupports[0].name, '학교 자체지원금');
  assert.equal(state.projects[0].otherSupports[0].amount, 32500);
});

test('학생용 계산방법은 단가 하나로 1인당/학생 총액을 구분하고 기존 총액 항목은 보존한다', () => {
  const perPerson = applyStudentCostMethod(createExpense(), 'perParticipant', '15000');
  assert.equal(perPerson.quantityBase, 'participants');
  assert.equal(perPerson.unitAmount, 15000);

  const studentTotal = applyStudentCostMethod(perPerson, 'studentTotal', '15000');
  assert.equal(studentTotal.quantityBase, 'participantsPlusAbsent');
  assert.equal(studentCostMethodOf(studentTotal), 'studentTotal');

  const legacy = createExpense({ calcMethod: 'sharedFixed', planAmount: 9000000 });
  assert.equal(studentCostMethodOf(legacy), 'legacyTotal');
  assert.equal(studentCostInputAmount(legacy), 9000000);
  const kept = applyStudentCostMethod(legacy, 'legacyTotal', '8000000');
  assert.equal(kept.calcMethod, 'sharedFixed');
  assert.equal(kept.planAmount, 8000000);
});
