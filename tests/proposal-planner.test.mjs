import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtherSupport } from '../js/budget.js';
import { studentCostLines, sumLines } from '../js/costLines.js';
import { createExpense, createProject } from '../js/presets.js';
import { addAllocations, normalizeProposalPlan, removeAllocation } from '../js/proposalPlan.js';
import {
  EDUCATION_BUDGET_ID,
  STUDENT_BUDGET_ID,
  VULNERABLE_BUDGET_ID,
  budgetChecklist,
  buildProposal,
  findAllocationResult
} from '../js/proposalPlanner.js';

// 2026학년도 2학년 수학여행 비용 산출 근거자료.xlsx 와 같은 조건
function excelProject() {
  const project = createProject('2학년 수학여행');
  Object.assign(project, {
    totalStudents: 72,
    actualParticipants: 70,
    absentStudents: 2,
    contractedAbsentStudents: 1,
    regularContractedAbsent: 1,
    vulnerableContractedAbsent: 0,
    vulnerableParticipants: 17,
    vulnerableAbsent: 0,
    chaperones: 8,
    dayAbsentSharesCommonCost: true,
    fixedCosts: {
      bus: { mode: 'total', amount: 9_000_000, includeChaperones: true, memo: '' },
      lodging: { mode: 'total', amount: 5_039_580, includeChaperones: false, memo: '2박' },
      insurance: { mode: 'perPerson', amount: 1600, memo: '' }
    }
  });
  const item = (id, date, name, unitAmount) => createExpense({ id, date, name, unitAmount });
  project.expenses = [
    item('ticket', '2026-05-13', '롯데월드 자유이용권', 30000),
    item('meal-coupon', '2026-05-13', '롯데월드 밀쿠폰 2장', 20000),
    item('breakfast2', '2026-05-14', '파크텔 조식', 12000),
    item('musical', '2026-05-14', '댄스뮤지컬 관람료', 18000),
    item('lunch2', '2026-05-14', '통인시장 중식', 10000),
    item('dinner2', '2026-05-14', '파크텔 석식', 15000),
    item('breakfast3', '2026-05-15', '파크텔 조식', 12000),
    item('lunch3', '2026-05-15', '덕평휴게소 중식', 10000),
    item('move', '2026-05-13', '서울 이동', 0)
  ];
  project.educationSupport = { ...project.educationSupport, regularPerPerson: 220000, vulnerableMode: 'full', grantTotal: 17_174_400 };
  project.otherSupports = [
    createOtherSupport({ id: 'culture', name: '문화예술체험활동비', amount: 18000 }),
    createOtherSupport({ id: 'school', name: '학교 자체지원금', amount: 32500 })
  ];
  return project;
}

const ALL_LINES = ['ticket', 'meal-coupon', 'breakfast2', 'musical', 'lunch2', 'dinner2', 'breakfast3', 'lunch3', 'fixed-bus', 'fixed-lodging', 'fixed-insurance'];

function excelPlan() {
  let plan = normalizeProposalPlan({});
  plan = addAllocations(plan, VULNERABLE_BUDGET_ID, ALL_LINES);
  plan = addAllocations(plan, EDUCATION_BUDGET_ID, ['fixed-bus', 'fixed-lodging', 'fixed-insurance', 'meal-coupon', 'ticket']);
  plan = addAllocations(plan, 'culture', ['musical']);
  plan = addAllocations(plan, 'school', ['ticket', 'breakfast2', 'lunch2']);
  plan = addAllocations(plan, STUDENT_BUDGET_ID, ['lunch2', 'dinner2', 'breakfast3', 'lunch3']);
  return plan;
}

const partsOf = (proposal, budgetId) => proposal.blocks
  .find(block => block.budget.id === budgetId).parts
  .map(part => [part.name, part.perPerson]);

test('학생 1인별 금액 산출 내역은 엑셀과 같고 기타비 비고에 산출 근거를 적는다', () => {
  const lines = studentCostLines(excelProject());
  const byName = Object.fromEntries(lines.map(line => [line.name, line]));

  assert.equal(lines.length, 11);
  assert.equal(byName['버스비'].perPerson, 113920);
  assert.equal(byName['버스비'].quantity, 71);
  assert.equal(byName['버스비'].basis, '총액 9,000,000원 ÷ (학생 71명(당일 불참 1명 포함) + 인솔자 8명), 10원 미만 버림');
  assert.equal(byName['숙소비'].basis, '총액 5,039,580원 ÷ 학생 71명(당일 불참 1명 포함)');
  assert.equal(byName['숙소비'].description, '2박');
  assert.equal(byName['보험비'].basis, '1인당 금액 1,600원 입력, 학생 70명');
  assert.equal(sumLines(lines, 'perPerson'), 313500);
  assert.equal(sumLines(lines, 'total'), 22_129_900);
});

test('예산 카드에 체크한 순서대로 채우면 엑셀의 예산별 품의 내용과 같다', () => {
  const project = excelProject();
  project.proposalPlan = excelPlan();
  const proposal = buildProposal(project);

  assert.equal(proposal.blocks.find(block => block.budget.id === VULNERABLE_BUDGET_ID).total, 5_329_500);
  assert.deepEqual(partsOf(proposal, EDUCATION_BUDGET_ID), [
    ['버스비', 113920], ['숙소비', 70980], ['보험비', 1600], ['롯데월드 밀쿠폰 2장', 20000], ['롯데월드 자유이용권', 13500]
  ]);
  assert.deepEqual(partsOf(proposal, 'culture'), [['댄스뮤지컬 관람료', 18000]]);
  assert.deepEqual(partsOf(proposal, 'school'), [['롯데월드 자유이용권', 16500], ['파크텔 조식', 12000], ['통인시장 중식', 4000]]);
  assert.deepEqual(partsOf(proposal, STUDENT_BUDGET_ID), [
    ['통인시장 중식', 6000], ['파크텔 석식', 15000], ['파크텔 조식', 12000], ['덕평휴게소 중식', 10000]
  ]);
  assert.deepEqual(proposal.dayAbsent.map(row => [row.name, row.total]), [['버스비', 113920], ['숙소비', 70980]]);

  assert.equal(proposal.education.total, 17_174_400);
  assert.equal(proposal.education.balance, 0);
  assert.equal(proposal.unassignedTotal, 0);
  assert.equal(proposal.vulnerableBurden.total, 0);
  assert.equal(proposal.assignedTotal, proposal.costTotal);
  assert.deepEqual(proposal.splits.map(split => split.name), ['롯데월드 자유이용권', '통인시장 중식']);
});

test('예산을 넘으면 최대 금액만 넣고 나머지를 다른 예산에서 고를 수 있게 남긴다', () => {
  const project = excelProject();
  project.proposalPlan = addAllocations(normalizeProposalPlan({}), EDUCATION_BUDGET_ID,
    ['fixed-bus', 'fixed-lodging', 'fixed-insurance', 'ticket', 'meal-coupon']);
  const proposal = buildProposal(project);

  const coupon = findAllocationResult(proposal, EDUCATION_BUDGET_ID, 'meal-coupon');
  assert.equal(coupon.overBudget, true);
  assert.equal(coupon.perPerson, 3500);
  assert.equal(coupon.left, 16500);

  const school = budgetChecklist(proposal, 'school').find(item => item.line.id === 'meal-coupon');
  assert.equal(school.checked, false);
  assert.equal(school.available, 16500);
  assert.equal(proposal.regularUnassignedPerPerson, 313500 - 220000);
});

test('체크를 빼면 뒤에 체크한 항목의 금액이 다시 계산되고, 취약계층 미배정 금액은 수익자 부담이 된다', () => {
  const project = excelProject();
  let plan = addAllocations(normalizeProposalPlan({}), EDUCATION_BUDGET_ID, ['fixed-bus', 'fixed-lodging', 'fixed-insurance', 'ticket', 'meal-coupon']);
  plan = removeAllocation(plan, EDUCATION_BUDGET_ID, 'ticket');
  project.proposalPlan = plan;
  const proposal = buildProposal(project);

  assert.equal(findAllocationResult(proposal, EDUCATION_BUDGET_ID, 'meal-coupon').perPerson, 20000);
  assert.equal(proposal.vulnerableBurden.perPerson, 313500);
  assert.equal(proposal.assignedTotal + proposal.unassignedTotal, proposal.costTotal);
});

test('예전 저장 형식(항목별 예산 선택)은 체크 순서로 옮긴다', () => {
  const plan = normalizeProposalPlan({ assignments: { b: 'education', a: 'school' }, order: ['a', 'b'] });
  assert.deepEqual(plan.allocations, [{ budgetId: 'school', lineId: 'a' }, { budgetId: 'education', lineId: 'b' }]);
});
