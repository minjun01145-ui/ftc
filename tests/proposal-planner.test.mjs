import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtherSupport } from '../js/budget.js';
import { studentCostLines, sumLines } from '../js/costLines.js';
import { createExpense, createProject } from '../js/presets.js';
import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, buildProposal } from '../js/proposalPlanner.js';

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
      bus: { mode: 'total', amount: 9_000_000, memo: '' },
      lodging: { mode: 'total', amount: 5_039_580, memo: '2박' },
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
  const culture = createOtherSupport({ id: 'culture', name: '(학교) 문화예술체험활동비', amount: 18000, restricted: true });
  const school = createOtherSupport({ id: 'school', name: '(학교) 현장체험학습비', amount: 32500 });
  project.otherSupports = [culture, school];
  project.proposalPlan = {
    assignments: {
      'fixed-bus': EDUCATION_BUDGET_ID, 'fixed-lodging': EDUCATION_BUDGET_ID, 'fixed-insurance': EDUCATION_BUDGET_ID,
      'meal-coupon': EDUCATION_BUDGET_ID, ticket: EDUCATION_BUDGET_ID,
      musical: 'culture',
      breakfast2: 'school', lunch2: 'school'
    },
    order: ['fixed-bus', 'fixed-lodging', 'fixed-insurance', 'meal-coupon', 'ticket', 'musical', 'breakfast2', 'lunch2', 'dinner2', 'breakfast3', 'lunch3']
  };
  return project;
}

const partsOf = (proposal, budgetId) => proposal.blocks
  .find(block => block.budget.id === budgetId).parts
  .map(part => [part.name, part.perPerson]);

test('학생 1인별 금액 산출 내역은 엑셀과 같다(금액 없는 일정은 제외)', () => {
  const lines = studentCostLines(excelProject());
  const byName = Object.fromEntries(lines.map(line => [line.name, line]));

  assert.equal(lines.length, 11);
  assert.equal(byName['버스비'].perPerson, 113920);
  assert.equal(byName['버스비'].quantity, 71);
  assert.equal(byName['버스비'].description, '9,000,000원 / 79명');
  assert.equal(byName['숙소비'].perPerson, 70980);
  assert.equal(byName['숙소비'].total, 5_039_580);
  assert.equal(byName['보험비'].quantity, 70);
  assert.equal(sumLines(lines, 'perPerson'), 313500);
  assert.equal(sumLines(lines, 'total'), 22_129_900);
});

test('예산별 품의 내용은 엑셀과 같이 예산을 채우고 넘친 금액을 다음 예산으로 넘긴다', () => {
  const proposal = buildProposal(excelProject());

  assert.deepEqual(proposal.vulnerable, { count: 17, perPerson: 313500, total: 5_329_500, burdenPerPerson: 0, burdenTotal: 0 });
  assert.deepEqual(proposal.dayAbsent.map(row => [row.name, row.total]), [['버스비', 113920], ['숙소비', 70980]]);
  assert.deepEqual(partsOf(proposal, EDUCATION_BUDGET_ID), [
    ['버스비', 113920], ['숙소비', 70980], ['보험비', 1600], ['롯데월드 밀쿠폰 2장', 20000], ['롯데월드 자유이용권', 13500]
  ]);
  assert.deepEqual(partsOf(proposal, 'culture'), [['댄스뮤지컬 관람료', 18000]]);
  assert.deepEqual(partsOf(proposal, 'school'), [['롯데월드 자유이용권', 16500], ['파크텔 조식', 12000], ['통인시장 중식', 4000]]);
  assert.deepEqual(partsOf(proposal, STUDENT_BUDGET_ID), [
    ['통인시장 중식', 6000], ['파크텔 석식', 15000], ['파크텔 조식', 12000], ['덕평휴게소 중식', 10000]
  ]);

  assert.equal(proposal.education.total, 17_174_400);
  assert.equal(proposal.education.balance, 0);
  assert.equal(proposal.blocks.find(block => block.budget.id === 'school').total, 1_722_500);
  assert.equal(proposal.blocks.find(block => block.budget.id === STUDENT_BUDGET_ID).total, 2_279_000);
  assert.equal(proposal.proposalTotal, proposal.costTotal);
  assert.equal(proposal.costTotal, 22_129_900);
  assert.deepEqual(proposal.splits.map(split => split.name), ['롯데월드 자유이용권', '통인시장 중식']);
});

test('예산 한도가 남으면 미사용 금액으로 알려 주고, 배정하지 않은 항목은 수익자 부담이 된다', () => {
  const project = excelProject();
  project.proposalPlan = { assignments: { 'fixed-bus': EDUCATION_BUDGET_ID }, order: [] };
  const proposal = buildProposal(project);
  const education = proposal.blocks.find(block => block.budget.id === EDUCATION_BUDGET_ID);

  assert.equal(education.usedPerPerson, 113920);
  assert.equal(education.unusedPerPerson, 220000 - 113920);
  assert.equal(proposal.assignments.ticket, STUDENT_BUDGET_ID);
  assert.equal(proposal.proposalTotal, proposal.costTotal);
});
