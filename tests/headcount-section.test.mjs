import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExpenses } from '../js/engine.js';
import { createExpense, createProject } from '../js/presets.js';
import { tripScheduleDateRange } from '../js/tripSchedule.js';
import { headcountIssues, renderHeadcountSection } from '../js/views/project/headcountSection.js';
import { readProjectForm } from '../js/views/projectView.js';
import { summarizeAttendance } from '../js/workflowEngine.js';

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

test('해당 학년 학생수는 인원 화면에서 직접 입력한다', () => {
  const project = createProject();
  project.grade = 2;
  project.totalStudents = 71;
  const html = renderHeadcountSection(project);
  assert.match(html, /id="totalStudents" name="totalStudents" type="number" min="0" step="1" value="71"/);
  assert.doesNotMatch(html, /id="totalStudents"[^>]*readonly/);
  assert.match(html, /<label for="applicants">신청자 수<\/label>/);
  assert.match(html, /name="vulnerableApplicants"/);
  assert.doesNotMatch(html, /실제 참여 학생 수/);
});

test('신청자 수와 취약계층 신청자 수를 인원 흐름에 반영한다', () => {
  const project = createProject();
  project.workflow.attendance.chaperones = 6;
  const form = fakeForm({ grade: '2', totalStudents: '71', applicants: '68', vulnerableApplicants: '12' });
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

test('신청 후 불참자는 1인당 금액에서 빠지고 학생 총액에는 포함된다', () => {
  const project = createProject();
  const form = fakeForm({
    grade: '2', totalStudents: '71', applicants: '70', dayAbsentStudents: '2',
    vulnerableApplicants: '12', dayAbsentSharesCommonCost: 'on'
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
});

test('신청자가 학년 학생수를 넘거나 불참이 신청자보다 많으면 저장하지 않는다', () => {
  assert.match(headcountIssues({ totalStudents: 71, applicants: 72, vulnerableApplicants: 0 })[0], /초과/);
  assert.match(headcountIssues({ totalStudents: 71, applicants: 10, vulnerableApplicants: 11 })[0], /취약계층/);
  assert.match(headcountIssues({ totalStudents: 0, applicants: 5, vulnerableApplicants: 0 })[0], /학년/);
  assert.match(headcountIssues({ totalStudents: 71, applicants: 60, vulnerableApplicants: 9, vulnerableDayAbsent: 10 })[0], /취약계층/);
  assert.match(headcountIssues({ totalStudents: 71, applicants: 60, vulnerableApplicants: 9, regularDayAbsent: 52 })[0], /비취약계층/);
  assert.deepEqual(headcountIssues({ totalStudents: 71, applicants: 70, vulnerableApplicants: 17, regularDayAbsent: 2 }), []);
});

test('신청 60명(비취약 51, 취약 9) 중 비취약 2명이 신청 후 불참하면 비취약 참여는 49명이다', () => {
  const project = createProject();
  const next = readProjectForm(fakeForm({
    grade: '2', totalStudents: '72', applicants: '60', vulnerableApplicants: '9',
    dayAbsentStudents: '2', vulnerableDayAbsentStudents: '0', dayAbsentSharesCommonCost: 'on'
  }), project);
  const summary = summarizeAttendance(next.workflow.attendance, next.totalStudents);

  assert.equal(summary.participants, 58);
  assert.equal(summary.regularParticipants, 49);
  assert.equal(summary.vulnerableParticipants, 9);
  assert.equal(summary.regularAbsent, 2);
  assert.deepEqual(summary.issues, []);
  assert.equal(next.regularContractedAbsent, 2);
  const html = renderHeadcountSection(next);
  assert.match(html, /id="applicants"[^>]*value="60"/);
  assert.match(html, /id="notAppliedStudents"[^>]*value="12"/);
  assert.match(html, /58명 \(비취약계층 49명, 취약계층 9명\)/);

  const vulnerable = readProjectForm(fakeForm({
    grade: '2', totalStudents: '72', applicants: '60', vulnerableApplicants: '9',
    dayAbsentStudents: '0', vulnerableDayAbsentStudents: '1'
  }), project);
  const vSummary = summarizeAttendance(vulnerable.workflow.attendance, vulnerable.totalStudents);
  assert.equal(vSummary.vulnerableParticipants, 8);
  assert.equal(vSummary.vulnerableAbsent, 1);
  assert.equal(vSummary.regularParticipants, 51);
  assert.deepEqual(vSummary.issues, []);
});
