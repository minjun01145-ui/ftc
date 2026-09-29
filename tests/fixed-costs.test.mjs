import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCostMethod, costInputAmount, costMethodOf, costMethodOptions } from '../js/costMethods.js';
import { calculateExpenses } from '../js/engine.js';
import {
  createCustomFixedCost,
  fixedCostBasisText,
  fixedCostBreakdown,
  fixedCostExpenses,
  fixedCostStaffShares,
  normalizeFixedCosts
} from '../js/fixedCosts.js';
import { createExpense, createProject, normalizeState } from '../js/presets.js';
import { cloneExpensesForStaff } from '../js/staffDraft.js';

const counts = { participants: 70, dayAbsent: 1, chaperones: 8 };
const entryOf = (fixedCosts, id) => normalizeFixedCosts(fixedCosts).find(entry => entry.id === id);

test('기타비는 기본 항목(버스·숙소·보험) 뒤에 사용자 항목을 붙이고, 예전 저장 형식도 읽는다', () => {
  const legacy = normalizeFixedCosts({
    bus: { mode: 'total', amount: 9_000_000 },
    lodging: { mode: 'total', amount: '1400000', memo: '2박' }
  });
  assert.deepEqual(legacy.map(entry => entry.id), ['bus', 'lodging', 'insurance']);
  assert.equal(legacy[0].includeChaperones, true, '예전 버스비는 인솔자와 나눴다');
  assert.equal(legacy[0].roundTo10, true, '예전에는 항상 10원 단위로 버렸다');
  assert.equal(legacy[1].memo, '2박');

  const custom = createCustomFixedCost({ label: '체험 안전요원', mode: 'total', amount: 800000 });
  const withCustom = normalizeFixedCosts([...legacy, custom]);
  assert.deepEqual(withCustom.map(entry => entry.label), ['버스비', '숙소비', '보험비', '체험 안전요원']);
  assert.equal(withCustom[3].commonCost, false);
});

test('기타비의 공통비 체크를 켜면 신청 후 불참자도 그 항목을 부담한다', () => {
  const guard = normalizeFixedCosts([{ id: 'guard', label: '안전요원', mode: 'total', amount: 710000, commonCost: true }])
    .find(entry => entry.id === 'guard');
  assert.equal(guard.commonCost, true);
  assert.equal(fixedCostBreakdown(guard, counts, { dayAbsentSharesCommonCost: true }).students, 71);
  const lodging = entryOf([{ builtin: 'lodging', commonCost: false, mode: 'total', amount: 700000 }], 'lodging');
  assert.equal(fixedCostBreakdown(lodging, counts, { dayAbsentSharesCommonCost: true }).students, 70, '숙소비도 공통비 체크를 끌 수 있다');
});

test('전체 계약액: 인솔자도 함께 부담이면 학생+인솔자로 나누고, 1원 단위 버림이면 10원 단위로 맞춘다', () => {
  const options = { dayAbsentSharesCommonCost: true };
  const bus = entryOf({ bus: { mode: 'total', amount: 9_000_000, includeChaperones: true, roundTo10: true } }, 'bus');
  const withStaff = fixedCostBreakdown(bus, counts, options);
  assert.equal(withStaff.divisor, 79);
  assert.equal(withStaff.perPerson, 113920);
  assert.equal(withStaff.studentTotal, 8_088_320);
  assert.equal(withStaff.chaperoneTotal, 911_360);
  assert.equal(withStaff.remainder, 320, '113,920원 × 79명 = 8,999,680원, 잔액 320원');

  const noRounding = fixedCostBreakdown({ ...bus, roundTo10: false }, counts, options);
  assert.equal(noRounding.perPerson, 113924);
  assert.equal(noRounding.remainder, 4);

  const studentsOnly = fixedCostBreakdown({ ...bus, includeChaperones: false }, counts, options);
  assert.equal(studentsOnly.divisor, 71);
  assert.equal(studentsOnly.perPerson, 126760);
});

test('버림 잔액과 인솔자 몫은 인솔자 비용으로 넘어간다', () => {
  const project = createProject();
  project.dayAbsentSharesCommonCost = true;
  project.fixedCosts = { bus: { mode: 'total', amount: 9_000_000, includeChaperones: true }, insurance: { mode: 'perPerson', amount: 1600 } };
  assert.deepEqual(fixedCostStaffShares(project, counts).map(share => [share.label, share.total]), [
    ['버스비 인솔자 몫', 911_360],
    ['버스비 버림 잔액', 320]
  ]);
});

test('당일 불참자 공통비용 부담을 끄면 버스비·숙소비는 실제 참여자만 나눈다', () => {
  const lodging = entryOf({ lodging: { mode: 'total', amount: 5_039_580 } }, 'lodging');
  assert.equal(fixedCostBreakdown(lodging, counts, { dayAbsentSharesCommonCost: false }).perPerson, 71990);
  const insurance = entryOf({ insurance: { mode: 'perPerson', amount: 1600 } }, 'insurance');
  assert.equal(fixedCostBreakdown(insurance, counts, { dayAbsentSharesCommonCost: true }).students, 70, '보험비는 공통비용이 아니다');
});

test('입력한 기타비는 체험처 비용 뒤에 붙어 학생 비용 합계에 들어간다', () => {
  const project = createProject();
  Object.assign(project, { totalStudents: 70, actualParticipants: 70 });
  project.fixedCosts = [
    { builtin: 'bus', mode: 'total', amount: 700000, includeChaperones: false },
    { builtin: 'lodging', mode: 'total', amount: 1400000 },
    { builtin: 'insurance', mode: 'perPerson', amount: 1600 },
    { id: 'custom-guard', label: '안전요원', mode: 'perPerson', amount: 5000 }
  ];
  project.expenses = [{ ...createExpense({ id: 'ticket' }), unitAmount: 30000 }];

  assert.deepEqual(fixedCostExpenses(project, { participants: 70, dayAbsent: 0, chaperones: 0 }).map(entry => entry.name), ['버스비', '숙소비', '보험비', '안전요원']);
  const result = calculateExpenses(project);
  assert.deepEqual(result.rows.map(row => row.id), ['ticket', 'fixed-bus', 'fixed-lodging', 'fixed-insurance', 'fixed-custom-guard']);
  assert.equal(result.studentTotal, 700000 + 1400000 + 1600 * 70 + 5000 * 70 + 30000 * 70);
});

test('기존 데이터에는 기본 기타비와 기타 지원금 구분을 채운다', () => {
  assert.deepEqual(fixedCostExpenses(createProject(), counts), []);
  const state = normalizeState({ school: {}, projects: [{ title: '기존', schoolSupport: { mode: 'perPersonRegular', amount: 32500 } }] });
  assert.equal(state.projects[0].fixedCosts.length, 3);
  assert.equal(state.projects[0].otherSupports[0].name, '학교 자체지원금');
  assert.equal(state.projects[0].otherSupports[0].source, 'school');
});

test('학생용 계산방법은 단가 하나로 1인당/학생 총액을 구분하고 예전 항목은 보존한다', () => {
  const perPerson = applyCostMethod('student', createExpense(), 'perParticipant', '15000');
  assert.equal(perPerson.quantityBase, 'participants');
  const studentTotal = applyCostMethod('student', perPerson, 'studentTotal', '15000');
  assert.equal(studentTotal.quantityBase, 'participantsPlusAbsent');

  const legacy = createExpense({ calcMethod: 'sharedFixed', planAmount: 9000000 });
  assert.equal(costMethodOf('student', legacy), 'legacy');
  assert.equal(costInputAmount('student', legacy), 9000000);
  assert.equal(applyCostMethod('student', legacy, 'legacy', '8000000').planAmount, 8000000);
});

test('인솔자용 표는 학생용과 같은 모양이고, 붙여넣기하면 단가가 그대로 복사된다', () => {
  assert.deepEqual(costMethodOptions('staff', createExpense()).map(option => option.label), ['1인당 금액', '총액']);
  const student = [applyCostMethod('student', createExpense({ name: '롯데월드' }), 'studentTotal', 30000)];
  const staff = cloneExpensesForStaff(student);
  assert.equal(costMethodOf('staff', staff[0]), 'perStaff');
  assert.equal(costInputAmount('staff', staff[0]), 30000);
  assert.notEqual(staff[0].id, student[0].id);
});

test('버스비 계산 인원을 직접 넣으면 그 인원으로 나누고, 넘는 인원 몫은 이 사업 비용이 아니다', () => {
  const bus = entryOf({ bus: { mode: 'total', amount: 9_000_000, includeChaperones: true, headcount: 150 } }, 'bus');
  assert.equal(bus.headcount, 150);
  const breakdown = fixedCostBreakdown(bus, { participants: 70, dayAbsent: 0, chaperones: 8 });
  assert.equal(breakdown.divisor, 150);
  assert.equal(breakdown.perPerson, 60000);
  assert.equal(breakdown.studentTotal, 4_200_000);
  assert.equal(breakdown.chaperoneTotal, 480_000);
  assert.equal(breakdown.otherTotal, 4_320_000);
  assert.equal(breakdown.remainder, 0);

  const tooSmall = fixedCostBreakdown({ ...bus, headcount: 10 }, { participants: 70, dayAbsent: 0, chaperones: 8 });
  assert.equal(tooSmall.divisor, 78, '이 사업 인원보다 적게는 나누지 않는다');
  assert.equal(entryOf({ bus: { mode: 'total', amount: 1, headcount: '' } }, 'bus').headcount, null);
});

test('다른 학년과 함께 계산하면 그 인원을 더해 나누고, 이 사업 인원이 바뀌어도 더한 인원은 그대로다', () => {
  const bus = entryOf({ bus: { mode: 'total', amount: 9_000_000, includeChaperones: true, sharedPeople: 72, sharedNote: '1학년 수학여행 72명' } }, 'bus');
  assert.equal(bus.sharedPeople, 72);
  assert.equal(bus.sharedNote, '1학년 수학여행 72명');
  const breakdown = fixedCostBreakdown(bus, { participants: 70, dayAbsent: 0, chaperones: 8 });
  assert.equal(breakdown.divisor, 150);
  assert.equal(breakdown.perPerson, 60000);
  assert.equal(breakdown.otherTotal, 4_320_000);
  assert.match(fixedCostBasisText(breakdown), /계산 인원 150명\(이 사업 학생 70명 \+ 인솔자 8명, 다른 학년 72명 포함\)/);
  assert.equal(fixedCostBreakdown(bus, { participants: 60, dayAbsent: 0, chaperones: 8 }).divisor, 140);
});

test('함께 계산하는 사업의 인원을 고치면 버스비 계산 인원이 따라 바뀐다', async () => {
  const { syncSharedCounts } = await import('../js/sharedCosts.js');
  const first = createProject('1학년');
  Object.assign(first, { actualParticipants: 69, contractedAbsentStudents: 1, chaperones: 8, dayAbsentSharesCommonCost: true });
  first.fixedCosts = { bus: { mode: 'total', amount: 9_000_000, includeChaperones: true } };
  const third = createProject('3학년');
  Object.assign(third, { actualParticipants: 60, chaperones: 10 });
  third.fixedCosts = { bus: { mode: 'total', amount: 9_000_000, includeChaperones: true, sharedProjectIds: [first.id] } };

  let state = syncSharedCounts({ school: {}, projects: [first, third] });
  let bus = normalizeFixedCosts(state.projects[1].fixedCosts)[0];
  assert.equal(bus.sharedPeople, 78, '학생 69 + 신청 후 불참 1 + 인솔자 8');
  assert.equal(bus.sharedNote, '1학년 78명');

  state.projects[0] = { ...state.projects[0], actualParticipants: 65, chaperones: 6 };
  state = syncSharedCounts(state);
  bus = normalizeFixedCosts(state.projects[1].fixedCosts)[0];
  assert.equal(bus.sharedPeople, 72);

  state = syncSharedCounts({ ...state, projects: [state.projects[1]] });
  bus = normalizeFixedCosts(state.projects[0].fixedCosts)[0];
  assert.deepEqual(bus.sharedProjectIds, [], '삭제한 사업은 연결에서 빠진다');
  assert.equal(bus.sharedPeople, 0);
});
