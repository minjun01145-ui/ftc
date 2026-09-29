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
  absentChecklist,
  absentLineId,
  budgetChecklist,
  buildProposal,
  findAllocationResult,
  withBudgetAmount
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
  plan = addAllocations(plan, EDUCATION_BUDGET_ID, [absentLineId('regular', 'fixed-bus'), absentLineId('regular', 'fixed-lodging')]);
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
  assert.equal(byName['버스비'].basis, '총액 9,000,000원 ÷ (학생 71명(신청 후 불참 1명 포함) + 인솔자 8명), 1원 단위 버림');
  assert.equal(byName['숙소비'].basis, '총액 5,039,580원 ÷ 학생 71명(신청 후 불참 1명 포함)');
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
  const education = proposal.blocks.find(block => block.budget.id === EDUCATION_BUDGET_ID);
  assert.deepEqual(education.absentParts.map(row => [row.name, row.count, row.total]), [['버스비', 1, 113920], ['숙소비', 1, 70980]]);
  assert.equal(education.participantTotal, 53 * 220000);
  assert.equal(education.total, 53 * 220000 + 184900);

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

test('예산이 가득 차면 체크하지 않은 다른 항목은 잠기고, 지원 금액을 고치면 다시 풀린다', () => {
  const project = excelProject();
  project.proposalPlan = addAllocations(normalizeProposalPlan({}), EDUCATION_BUDGET_ID,
    ['fixed-bus', 'fixed-lodging', 'fixed-insurance', 'ticket', 'meal-coupon']);
  const full = budgetChecklist(buildProposal(project), EDUCATION_BUDGET_ID);
  assert.equal(full.find(item => item.line.id === 'dinner2').locked, true);
  assert.equal(full.find(item => item.line.id === 'dinner2').lockReason, 'full');

  const raised = withBudgetAmount(project, EDUCATION_BUDGET_ID, 300000);
  assert.equal(raised.educationSupport.regularPerPerson, 300000);
  const reopened = budgetChecklist(buildProposal(raised), EDUCATION_BUDGET_ID);
  assert.equal(reopened.find(item => item.line.id === 'dinner2').locked, false);

  const school = withBudgetAmount(project, 'school', 40000);
  assert.equal(school.otherSupports.find(support => support.id === 'school').amount, 40000);
});

test('신청 후 불참자 공통비는 따로 나오고, 체크한 예산에 인원 × 1인당 금액으로 들어간다', () => {
  const project = excelProject();
  project.proposalPlan = normalizeProposalPlan({});
  let proposal = buildProposal(project);

  assert.equal(proposal.counts.regular, 53);
  assert.equal(proposal.counts.vulnerable, 17);
  assert.equal(proposal.counts.regularAbsent, 1);
  assert.deepEqual(proposal.absent.map(line => [line.name, line.count, line.perPerson, line.total]), [
    ['버스비', 1, 113920, 113920], ['숙소비', 1, 70980, 70980]
  ]);
  assert.deepEqual(proposal.unassigned.absent.map(line => line.name), ['버스비', '숙소비']);
  assert.equal(proposal.assignedTotal + proposal.unassignedTotal, proposal.costTotal);
  // 비취약 불참자 몫은 취약계층 예산에 넣을 수 없다.
  assert.deepEqual(absentChecklist(proposal, VULNERABLE_BUDGET_ID), []);

  // 기타 지원금은 참여 학생 몫이라 불참 학생 항목을 넣을 수 없다.
  assert.deepEqual(absentChecklist(proposal, 'school'), []);
  assert.equal(absentChecklist(proposal, STUDENT_BUDGET_ID).length, 2);
});

test('교육청 예산은 신청 후 불참 학생 몫까지 잡고, 불참 학생 몫은 공통비에만 한도 안에서 쓴다', () => {
  const project = excelProject();
  project.educationSupport = { ...project.educationSupport, regularPerPerson: 100000 };
  project.proposalPlan = addAllocations(normalizeProposalPlan({}), EDUCATION_BUDGET_ID,
    ['ticket', 'meal-coupon', 'breakfast2', 'musical', 'lunch2', 'dinner2', absentLineId('regular', 'fixed-bus'), absentLineId('regular', 'fixed-lodging')]);
  let proposal = buildProposal(project);
  const education = () => proposal.blocks.find(block => block.budget.id === EDUCATION_BUDGET_ID);

  assert.equal(education().budgetTotal, 100000 * 54, '참여 53명 + 신청 후 불참 1명');
  assert.equal(education().full, true);
  const bus = findAllocationResult(proposal, EDUCATION_BUDGET_ID, absentLineId('regular', 'fixed-bus'));
  assert.equal(bus.perPerson, 100000, '버스비 113,920원 중 불참 학생 지원금 100,000원만');
  assert.equal(bus.left, 13920);
  const lodging = findAllocationResult(proposal, EDUCATION_BUDGET_ID, absentLineId('regular', 'fixed-lodging'));
  assert.equal(lodging.perPerson, 0, '불참 학생 지원금을 다 써서 숙소비는 못 넣는다');
  assert.equal(education().absentFull, true);
  assert.equal(education().total, 100000 * 54);
  assert.deepEqual(proposal.unassigned.absent.map(line => [line.name, line.perPerson]), [['버스비', 13920], ['숙소비', 70980]]);

  // 넘친 금액은 수익자 부담에 넣을 수 있다.
  project.proposalPlan = addAllocations(project.proposalPlan, STUDENT_BUDGET_ID, [absentLineId('regular', 'fixed-bus'), absentLineId('regular', 'fixed-lodging')]);
  proposal = buildProposal(project);
  assert.deepEqual(proposal.unassigned.absent, []);
  assert.equal(proposal.blocks.find(block => block.budget.id === STUDENT_BUDGET_ID).absentTotal, 13920 + 70980);
  assert.equal(proposal.assignedTotal + proposal.unassignedTotal, proposal.costTotal);
});

test('공통비 부담을 체크하지 않으면 신청 후 불참 항목이 없다', () => {
  const project = excelProject();
  project.dayAbsentSharesCommonCost = false;
  const proposal = buildProposal(project);
  assert.equal(proposal.counts.regularAbsent, 0);
  assert.deepEqual(proposal.absent, []);
});
