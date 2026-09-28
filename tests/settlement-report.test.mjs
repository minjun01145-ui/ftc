import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtherSupport } from '../js/budget.js';
import { createExpense, createProject } from '../js/presets.js';
import { addAllocations, normalizeProposalPlan } from '../js/proposalPlan.js';
import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, VULNERABLE_BUDGET_ID } from '../js/proposalPlanner.js';
import { buildSettlementReport, dayCount, periodText } from '../js/settlementReport.js';

// 주례여자중학교_2026학년도 상반기 (중2)현장체험학습비 지원금 정산 서식.xlsx 7행과 같은 조건
function settledProject() {
  const project = createProject('2학년 수학여행');
  Object.assign(project, {
    grade: 2, executionMode: '숙박형', place: '서울', startDate: '2026-05-13', endDate: '2026-05-15',
    totalStudents: 72, actualParticipants: 70, absentStudents: 2,
    contractedAbsentStudents: 1, regularContractedAbsent: 1, vulnerableContractedAbsent: 0,
    vulnerableParticipants: 18, vulnerableAbsent: 0, chaperones: 8, dayAbsentSharesCommonCost: true,
    fixedCosts: {
      bus: { mode: 'total', amount: 9_000_000, includeChaperones: true },
      lodging: { mode: 'total', amount: 5_039_580 },
      insurance: { mode: 'perPerson', amount: 1600 }
    }
  });
  const item = (id, name, unitAmount) => createExpense({ id, date: '2026-05-13', name, unitAmount });
  project.expenses = [
    item('ticket', '롯데월드 자유이용권', 30000), item('coupon', '밀쿠폰', 20000), item('b2', '조식', 12000),
    item('musical', '뮤지컬', 18000), item('l2', '통인시장 중식', 10000), item('d2', '석식', 15000),
    item('b3', '조식', 12000), item('l3', '덕평 중식', 10000)
  ];
  project.educationSupport = { ...project.educationSupport, regularPerPerson: 220000, vulnerableMode: 'full', grantTotal: 20_360_000 };
  project.otherSupports = [
    createOtherSupport({ id: 'culture', name: '예술문화체험비', amount: 18000 }),
    createOtherSupport({ id: 'school', name: '자체 수학여행 지원비', amount: 32500 })
  ];
  let plan = addAllocations(normalizeProposalPlan({}), VULNERABLE_BUDGET_ID,
    ['ticket', 'coupon', 'b2', 'musical', 'l2', 'd2', 'b3', 'l3', 'fixed-bus', 'fixed-lodging', 'fixed-insurance']);
  plan = addAllocations(plan, EDUCATION_BUDGET_ID, ['fixed-bus', 'fixed-lodging', 'fixed-insurance', 'coupon', 'ticket']);
  plan = addAllocations(plan, 'culture', ['musical']);
  plan = addAllocations(plan, 'school', ['ticket', 'b2', 'l2']);
  plan = addAllocations(plan, STUDENT_BUDGET_ID, ['l2', 'd2', 'b3', 'l3']);
  project.proposalPlan = plan;
  return project;
}

test('정산 서식 7행 값은 실제 제출한 정산 서식과 같다', () => {
  const { values, warnings } = buildSettlementReport(settledProject(), { name: '주례여자중학교' });

  assert.deepEqual(warnings, []);
  assert.equal(values.schoolName, '주례여자중학교');
  assert.equal(values.schoolLevel, '중');
  assert.equal(values.establishment, '공립');
  assert.equal(values.grade, 2);
  assert.equal(values.period, '5.13.~5.15.');
  assert.equal(values.days, 3);
  assert.equal(values.totalStudents, 72);
  assert.equal(values.regularParticipants, 52);
  assert.equal(values.vulnerableParticipants, 18);
  assert.equal(values.participants, 70);
  assert.equal(values.perPerson, 313500);
  assert.equal(values.grantTotal, 20_360_000);
  assert.equal(values.executed, 17_267_900);
  assert.equal(values.balance, 3_092_100);
  assert.equal(values.schoolBurden, 2_626_000);
  assert.equal(values.studentBurden, 2_236_000);
  assert.equal(values.externalSupport, 0);
  assert.equal(values.burdenSubtotal, 4_862_000);
  assert.equal(values.dayAbsentCommonCost, 184_900);
  assert.equal(values.remarks, [
    '학교 자체 지원:',
    '- 예술문화체험비(1인당 18,000원 * 52명 = 936,000원)',
    '- 자체 수학여행 지원비(1인당 32,500원 * 52명 = 1,690,000원)',
    '- 936,000원 + 1,690,000원 = 2,626,000원',
    '',
    '당일 불참자 공통경비(버스비, 숙소비): 184,900원'
  ].join('\n'));
});

test('외부 지원금은 학교부담이 아니라 외부지원 칸으로 간다', () => {
  const project = settledProject();
  project.otherSupports = project.otherSupports.map(support => (support.id === 'culture' ? { ...support, source: 'external' } : support));
  const { values } = buildSettlementReport(project, { name: '주례여자중학교' });
  assert.equal(values.externalSupport, 936_000);
  assert.equal(values.schoolBurden, 1_690_000);
  assert.match(values.remarks, /외부 지원:\n- 예술문화체험비/);
});

test('기간과 일수는 서식 형식(연도 생략)으로 만든다', () => {
  assert.equal(periodText('2026-05-13', '2026-05-15'), '5.13.~5.15.');
  assert.equal(periodText('2026-05-13', ''), '5.13.');
  assert.equal(dayCount('2026-05-13', '2026-05-15'), 3);
});
