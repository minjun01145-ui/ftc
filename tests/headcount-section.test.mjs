import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpenses } from '../js/engine.js';
import { createExpense, createProject } from '../js/presets.js';
import { tripScheduleDateRange } from '../js/tripSchedule.js';
import { gradeStudentCount, headcountIssues, renderHeadcountSection } from '../js/views/project/headcountSection.js';
import { readProjectForm } from '../js/views/projectView.js';
import { summarizeAttendance } from '../js/workflowEngine.js';

const school = { grade1Students: 90, grade2Students: 71, grade3Students: 80 };

function fakeForm(values) {
  const entries = Object.entries(values);
  globalThis.FormData = class {
    has(name) { return entries.some(([key]) => key === name); }
    get(name) { return entries.find(([key]) => key === name)?.[1] ?? null; }
  };
  return { querySelector: () => null };
}

test('일정 날짜 중 가장 이른 날과 늦은 날을 사업 기간으로 쓴다', () => {
  assert.deepEqual(tripScheduleDateRange([
    { date: '2026-05-14' }, { date: '' }, { date: '2026-05-13' }, { date: '2026-05-15' }, { date: '5/16' }
  ]), { startDate: '2026-05-13', endDate: '2026-05-15' });
  assert.equal(tripScheduleDateRange([{ date: '' }]), null);
});

test('해당 학년 학생수는 기본정보에서 읽기 전용으로 불러온다', () => {
  const project = createProject();
  project.grade = 2;
  const html = renderHeadcountSection(project, school);
  assert.match(html, /id="totalStudents"[^>]*readonly[^>]*value="71"/);
  assert.match(html, /name="actualParticipants"/);
  assert.match(html, /name="vulnerableParticipants"/);
  assert.equal(gradeStudentCount(school, 3), 80);
  assert.equal(gradeStudentCount(school, ''), 0);
});

test('실제 참여 인원과 취약계층 인원을 인원 흐름에 반영한다', () => {
  const project = createProject();
  project.workflow.attendance.chaperones = 6;
  const form = fakeForm({ grade: '2', totalStudents: '71', actualParticipants: '68', vulnerableParticipants: '12' });
  const next = readProjectForm(form, project);
  const summary = summarizeAttendance(next.workflow.attendance, next.totalStudents);

  assert.equal(next.grade, 2);
  assert.equal(next.totalStudents, 71);
  assert.equal(summary.participants, 68);
  assert.equal(summary.vulnerableParticipants, 12);
  assert.equal(summary.regularParticipants, 56);
  assert.equal(summary.chaperones, 6);
  assert.deepEqual(summary.issues, []);
  assert.equal(next.actualParticipants, 68);
  assert.equal(next.absentStudents, 3);
});

test('당일 불참자는 1인당 금액에서 빠지고 학생 총액에는 포함된다', () => {
  const project = createProject();
  const form = fakeForm({
    grade: '2', totalStudents: '71', actualParticipants: '68', dayAbsentStudents: '2',
    vulnerableParticipants: '12', dayAbsentSharesCommonCost: 'on'
  });
  const next = readProjectForm(form, project);
  next.expenses = [
    { ...createExpense({ id: 'per' }), unitAmount: 1000, quantityBase: 'participants' },
    { ...createExpense({ id: 'total' }), unitAmount: 1000, quantityBase: 'participantsPlusAbsent' }
  ];
  const rows = calculateExpenses(next).rows;

  assert.equal(next.dayAbsentSharesCommonCost, true);
  assert.equal(next.actualParticipants, 68);
  assert.equal(rows.find(row => row.id === 'per').studentTotal, 68_000);
  assert.equal(rows.find(row => row.id === 'total').studentTotal, 70_000);
  assert.deepEqual(headcountIssues({ totalStudents: 71, participants: 70, dayAbsent: 2, vulnerableParticipants: 0 }).length, 1);
  assert.doesNotMatch(renderHeadcountSection(next, school), /실제 참여 학생 중 취약계층은/);
});

test('참여 인원이 학년 학생수나 참여자보다 많으면 저장하지 않는다', () => {
  assert.match(headcountIssues({ totalStudents: 71, participants: 72, vulnerableParticipants: 0 })[0], /초과/);
  assert.match(headcountIssues({ totalStudents: 71, participants: 10, vulnerableParticipants: 11 })[0], /취약계층/);
  assert.match(headcountIssues({ totalStudents: 0, participants: 5, vulnerableParticipants: 0 })[0], /학년/);
  assert.deepEqual(headcountIssues({ totalStudents: 71, participants: 70, vulnerableParticipants: 17 }), []);
});
