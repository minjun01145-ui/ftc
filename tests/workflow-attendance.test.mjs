import assert from 'node:assert/strict';
import test from 'node:test';
import { createProject, normalizeState } from '../js/presets.js';
import { renderHeadcountSection } from '../js/views/project/headcountSection.js';
import { renderWorkflowSection } from '../js/views/project/workflowSection.js';
import { attendanceInputValues, summarizeAttendance } from '../js/workflowEngine.js';

const validAttendance = overrides => ({
  schema: 'core-v1',
  applicants: 90,
  chaperones: 5,
  vulnerableEnrolled: 12,
  vulnerableNotApplied: 2,
  vulnerableDayAbsent: 1,
  regularDayAbsent: 4,
  ...overrides
});

test('새 인원 구조는 사업의 전체 재적을 사용해 신청·참여 인원을 계산한다', () => {
  const summary = summarizeAttendance(validAttendance(), 100);

  assert.equal(summary.enrolled, 100);
  assert.equal(summary.applicants, 90);
  assert.equal(summary.participants, 85);
  assert.equal(summary.vulnerableApplicants, 10);
  assert.equal(summary.vulnerableParticipants, 9);
  assert.equal(summary.regularParticipants, 76);
  assert.equal(summary.vulnerableAbsent, 1);
  assert.equal(summary.regularAbsent, 4);
  assert.equal(summary.chaperones, 5);
  assert.deepEqual(summary.issues, []);
});

test('음수·소수·재적 초과와 불가능한 취약 및 당일 불참 인원을 막는다', () => {
  const cases = [
    [validAttendance({ applicants: -1 }), 100, /신청 학생 수.*0 이상의 정수/],
    [validAttendance({ chaperones: 1.5 }), 100, /인솔자 수.*0 이상의 정수/],
    [validAttendance({ applicants: 101 }), 100, /전체 재적.*초과/],
    [validAttendance({ vulnerableNotApplied: 13 }), 100, /취약 미신청.*초과/],
    [validAttendance({ vulnerableDayAbsent: 11 }), 100, /취약 당일 불참.*초과/],
    [validAttendance({ regularDayAbsent: 81 }), 100, /비취약 당일 불참.*초과/]
  ];

  for (const [attendance, enrolled, expected] of cases) {
    assert.match(summarizeAttendance(attendance, enrolled).issues.join(' '), expected);
  }
});

test('v5 취소·불참 인원은 새 입력으로 명시 변환하고 기존 값도 보존한다', () => {
  const legacyAttendance = {
    enrolled: 10,
    notApplied: 1,
    preContractCanceled: 1,
    postContractCanceled: 1,
    dayAbsent: 1,
    chaperones: 2,
    vulnerableEnrolled: 4,
    vulnerableNotApplied: 1,
    vulnerablePreContractCanceled: 1,
    vulnerablePostContractCanceled: 0,
    vulnerableDayAbsent: 1,
    fixedCostAbsent: 0
  };
  const state = normalizeState({
    schemaVersion: 5,
    school: {},
    projects: [{ id: 'legacy', totalStudents: 10, workflow: { attendance: legacyAttendance } }]
  });
  const old = state.projects[0].workflow.attendance;
  const mapped = attendanceInputValues(old, state.projects[0].totalStudents);
  const upgraded = summarizeAttendance({ schema: 'core-v1', ...mapped }, state.projects[0].totalStudents);
  const before = summarizeAttendance(old, state.projects[0].totalStudents);

  assert.equal(state.schemaVersion, 6);
  assert.equal(old.schema, 'legacy-v5');
  assert.equal(old.preContractCanceled, 1);
  assert.deepEqual(mapped, {
    applicants: 7,
    chaperones: 2,
    vulnerableEnrolled: 4,
    vulnerableNotApplied: 2,
    vulnerableDayAbsent: 1,
    regularDayAbsent: 0
  });
  assert.equal(upgraded.participants, before.participants);
  assert.equal(upgraded.vulnerableParticipants, before.vulnerableParticipants);
});

test('재적은 앞 단계에 한 번만 입력하고 업무 흐름에는 여섯 핵심 인원만 입력한다', () => {
  const project = createProject('인원 흐름 확인');
  project.totalStudents = 100;
  project.workflow.attendance = validAttendance();
  const workflowHtml = renderWorkflowSection(project, { name: '테스트중학교' });
  const headcountHtml = renderHeadcountSection(project);

  for (const label of [
    '신청 학생 수', '인솔자 수', '취약계층 재적 인원', '취약계층 미신청 인원',
    '취약계층 당일 불참 인원', '비취약계층 당일 불참 인원'
  ]) assert.ok(workflowHtml.includes(label), `missing label: ${label}`);
  for (const removed of ['name="totalStudents"', 'name="schoolLevel"', 'name="establishment"', '연간 가용예산', '전체 미신청 인원']) {
    assert.ok(!workflowHtml.includes(removed), `unexpected workflow input: ${removed}`);
  }
  assert.equal((headcountHtml.match(/name="totalStudents"/g) ?? []).length, 1);
  assert.ok(!workflowHtml.includes('계약 90명'));
});

