import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpense, sampleProject } from '../js/presets.js';
import { allocateFunding, calculateExpense, calculateStaffExpense, projectCounts, validateProject } from '../js/engine.js';

test('기본 인원 계산', () => {
  const project = sampleProject();
  const counts = projectCounts(project);

  assert.equal(counts.participants, 70);
  assert.equal(counts.absent, 1);
  assert.equal(counts.regularParticipants, 53);
  assert.equal(counts.vulnerableParticipants, 17);
});

test('차량 총액을 학생과 인솔자가 분담한다', () => {
  const project = sampleProject();
  const bus = calculateExpense(project.expenses[0], project, false);

  assert.equal(bus.unit, 113920);
  assert.equal(bus.studentTotal, 8088320);
  assert.equal(bus.staffTotal, 911680);
});

test('재원 배분 합계는 학생경비 합계와 일치한다', () => {
  const project = sampleProject();
  const funding = allocateFunding(project, false);

  assert.ok(funding.expenses.studentTotal > 0);
  assert.equal(
    funding.educationUsed + funding.schoolUsed + funding.studentUsed,
    funding.expenses.studentTotal
  );
  assert.deepEqual(validateProject(project, false).issues, []);
});

test('참가인원이 바뀌면 차량 1인당 금액도 바뀐다', () => {
  const project = sampleProject();
  const original = calculateExpense(project.expenses[0], project, false);
  const changed = structuredClone(project);
  changed.actualParticipants = 69;
  changed.absentStudents = 1;
  const recalculated = calculateExpense(changed.expenses[0], changed, false);

  assert.notEqual(recalculated.unit, original.unit);
});

test('취약계층 입력값이 참가자수보다 많으면 검증에서 잡는다', () => {
  const project = sampleProject();
  project.vulnerableParticipants = project.actualParticipants + 1;
  project.vulnerableAbsent = project.absentStudents + 1;

  const issues = validateProject(project, false).issues;

  assert.ok(issues.some(issue => issue.includes('취약계층 참가학생수')));
  assert.ok(issues.some(issue => issue.includes('취약계층 불참자수')));
});

test('인솔자 전용 1인당 비용은 인솔자 수를 기준으로 계산한다', () => {
  const project = sampleProject();
  const expense = createExpense({ calcMethod: 'perPerson', unitAmount: 12000 });
  assert.equal(calculateStaffExpense(expense, project, false).total, 96000);
});

test('인솔자 전용 정산액이 입력되면 실제 지출액을 사용한다', () => {
  const project = sampleProject();
  const expense = createExpense({ calcMethod: 'perPerson', unitAmount: 12000, actualAmount: 91000 });
  assert.equal(calculateStaffExpense(expense, project, true).total, 91000);
});

test('공통 총액 방식의 인솔자 전용 계산은 학생 계산의 인솔자 몫과 일치한다', () => {
  const project = sampleProject();
  const expense = project.expenses[0];
  assert.equal(
    calculateStaffExpense(expense, project, false).total,
    calculateExpense(expense, project, false).staffTotal
  );
});
