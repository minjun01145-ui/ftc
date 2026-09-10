import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleProject } from '../js/presets.js';
import { allocateFunding, calculateExpense, projectCounts, validateProject } from '../js/engine.js';

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
