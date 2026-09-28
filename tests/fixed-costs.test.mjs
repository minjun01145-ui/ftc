import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpenses } from '../js/engine.js';
import { fixedCostAmounts, fixedCostExpenses, normalizeFixedCosts } from '../js/fixedCosts.js';
import { createExpense, createProject, normalizeState } from '../js/presets.js';
import { applyStudentCostMethod, studentCostInputAmount, studentCostMethodOf } from '../js/studentCostMethod.js';
import { renderFixedCostSummary } from '../js/views/project/fixedCostSection.js';

function projectWithParticipants(participants) {
  const project = createProject();
  project.totalStudents = participants;
  project.actualParticipants = participants;
  return project;
}

test('버스비는 전체 계약액만, 숙소·보험비는 1인당/전체 계약액을 고를 수 있다', () => {
  const normalized = normalizeFixedCosts({
    bus: { mode: 'perPerson', amount: 900000 },
    lodging: { mode: 'total', amount: '1400000' },
    insurance: { mode: 'weird', amount: -5 }
  });
  assert.deepEqual(normalized, {
    bus: { mode: 'total', amount: 900000 },
    lodging: { mode: 'total', amount: 1400000 },
    insurance: { mode: 'perPerson', amount: 0 }
  });
});

test('전체 계약액은 참여 학생 수로 나누고, 1인당 금액은 참여 학생 수를 곱한다', () => {
  assert.deepEqual(fixedCostAmounts({ mode: 'total', amount: 1400000 }, 70), { perPerson: 20000, total: 1400000 });
  assert.deepEqual(fixedCostAmounts({ mode: 'perPerson', amount: 1600 }, 70), { perPerson: 1600, total: 112000 });
  assert.deepEqual(fixedCostAmounts({ mode: 'total', amount: 1000 }, 0), { perPerson: 0, total: 1000 });
});

test('입력한 고정비는 체험처 비용과 함께 학생 비용 합계에 들어간다', () => {
  const project = projectWithParticipants(70);
  project.fixedCosts = {
    bus: { mode: 'total', amount: 900000 },
    lodging: { mode: 'total', amount: 1400000 },
    insurance: { mode: 'perPerson', amount: 1600 }
  };
  project.expenses = [{ ...createExpense({ id: 'ticket' }), unitAmount: 30000 }];

  assert.deepEqual(fixedCostExpenses(project).map(item => item.name), ['버스비', '숙소비', '보험비']);
  const result = calculateExpenses(project);
  assert.equal(result.rows.length, 4);
  assert.equal(result.studentTotal, 900000 + 1400000 + 1600 * 70 + 30000 * 70);
  assert.match(renderFixedCostSummary(project), /20,000/);
});

test('금액이 0인 고정비는 비용 항목을 만들지 않고 기존 데이터에는 기본값을 채운다', () => {
  assert.deepEqual(fixedCostExpenses(createProject()), []);
  const state = normalizeState({ school: {}, projects: [{ title: '기존' }] });
  assert.deepEqual(state.projects[0].fixedCosts.bus, { mode: 'total', amount: 0 });
  assert.equal(state.projects[0].dayAbsentSharesCommonCost, false);
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
