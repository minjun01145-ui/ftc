import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtherSupport } from '../js/budget.js';
import { activeFixedCosts, normalizeFixedCosts } from '../js/fixedCosts.js';
import { calculateExpenses } from '../js/engine.js';
import { createExpense, createProject } from '../js/presets.js';
import { addAllocations, normalizeProposalPlan } from '../js/proposalPlan.js';
import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, VULNERABLE_BUDGET_ID, absentLineId } from '../js/proposalPlanner.js';
import { buildVerification } from '../js/verification.js';
import { headcountAttendance } from '../js/views/project/headcountSection.js';
import { renderVerifySection } from '../js/views/project/verifySection.js';

// 신청 12명(취약 2), 비취약 1명 신청 후 불참, 교육청 1인당 100,000원
function project() {
  const p = createProject('검증');
  p.grade = 1;
  p.totalStudents = 15;
  p.workflow.attendance = headcountAttendance({}, 0, { applicants: 12, vulnerableApplicants: 2, regularDayAbsent: 1, vulnerableDayAbsent: 0, chaperones: 2 });
  Object.assign(p, {
    actualParticipants: 11, vulnerableParticipants: 2, contractedAbsentStudents: 1, regularContractedAbsent: 1,
    vulnerableContractedAbsent: 0, chaperones: 2, dayAbsentSharesCommonCost: true
  });
  p.fixedCosts = [{ builtin: 'bus', mode: 'total', amount: 1_000_000, includeChaperones: true }];
  p.expenses = [createExpense({ id: 'ticket', date: '2026-05-13', name: '입장료', unitAmount: 50000 })];
  p.educationSupport = { ...p.educationSupport, regularPerPerson: 100000, vulnerableMode: 'full', grantTotal: 1_214_260 };
  p.otherSupports = [createOtherSupport({ id: 'school', name: '학교 자체지원금', amount: 20000 })];
  return p;
}

const byId = (result, id) => result.checks.find(check => check.id === id);

test('모두 배정하면 금액 검증이 모두 맞고, 식을 사람이 따라 계산할 수 있게 보여 준다', () => {
  const p = project();
  // 버스비 1인 = 1,000,000 ÷ (12 + 2) = 71,420원 → 1인당 121,420원
  let plan = addAllocations(normalizeProposalPlan({}), VULNERABLE_BUDGET_ID, ['ticket', 'fixed-bus']);
  plan = addAllocations(plan, EDUCATION_BUDGET_ID, ['ticket', 'fixed-bus', absentLineId('regular', 'fixed-bus')]);
  plan = addAllocations(plan, 'school', ['fixed-bus']);
  plan = addAllocations(plan, STUDENT_BUDGET_ID, ['fixed-bus']);
  p.proposalPlan = plan;
  const result = buildVerification(p);

  assert.equal(byId(result, 'headcount').status, 'ok');
  assert.equal(byId(result, 'per-person-total').status, 'ok');
  assert.match(byId(result, 'per-person-total').lines[0], /121,420원 × 참여 11명/);
  assert.match(byId(result, 'per-person-total').lines[1], /신청 후 불참\(비취약계층\) 공통비 71,420원 × 1명/);
  assert.equal(byId(result, 'cohorts').status, 'ok');
  assert.equal(byId(result, 'per-person-split').status, 'ok');
  assert.match(byId(result, 'per-person-split').lines[0], /교육청 100,000원 \+ 학교 자체지원금 20,000원 \+ 수익자 부담 1,420원 = 121,420원/);
  assert.equal(byId(result, 'fixed-costs').status, 'ok');
  assert.match(byId(result, 'fixed-costs').lines[0], /버스비 1,000,000원 = 학생 12명 × 71,420원 = 857,040원 \+ 인솔자 2명 142,840원 \+ 버림 잔액 120원/);
  assert.equal(byId(result, 'unassigned').status, 'ok');
  assert.equal(result.summary.fail, 0);
  assert.match(renderVerifySection(p), /verify-card ok/);
});

test('배정이 덜 되었거나 교부액을 넘으면 알려 준다', () => {
  const p = project();
  p.educationSupport.grantTotal = 500_000;
  p.proposalPlan = addAllocations(normalizeProposalPlan({}), EDUCATION_BUDGET_ID, ['ticket']);
  const result = buildVerification(p);
  assert.equal(byId(result, 'unassigned').status, 'warn');
  assert.equal(byId(result, 'cohorts').status, 'warn');
  assert.equal(byId(result, 'education').status, 'warn', '사용 450,000원, 잔액 50,000원은 반납 대상');
  p.educationSupport.grantTotal = 400_000;
  assert.equal(byId(buildVerification(p), 'education').status, 'fail');
});

test('기본 기타비(버스비)를 삭제하면 계산에서 빠지고 다시 추가할 수 있다', () => {
  const p = project();
  p.fixedCosts = normalizeFixedCosts(p.fixedCosts).map(entry => (entry.builtin === 'bus' ? { ...entry, removed: true } : entry));
  assert.equal(normalizeFixedCosts(p.fixedCosts).find(entry => entry.builtin === 'bus').removed, true);
  assert.deepEqual(activeFixedCosts(p.fixedCosts).map(entry => entry.builtin), ['lodging', 'insurance']);
  assert.deepEqual(calculateExpenses(p).rows.map(row => row.id), ['ticket']);
});

test('인원 화면 값과 계산에 쓰는 값이 다르면 인원 검증이 맞지 않는다', () => {
  const p = { ...project(), vulnerableParticipants: 0 };
  const check = byId(buildVerification(p), 'headcount');
  assert.equal(check.status, 'fail');
  assert.match(check.items.join(' '), /인원 화면에서 저장해 주세요/);
});
