import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleProject } from '../js/presets.js';
import { PROJECT_SECTION } from '../js/projectSections.js';
import { cloneExpensesForStaff } from '../js/views/expenseTable.js';
import { renderProjectPage } from '../js/views/projectView.js';
import { newSourceRowHtml } from '../js/views/project/workflowSection.js';

test('전체보기는 인원 다음 학생용, 인솔자용, 예산 순서로 표시한다', () => {
  const html = renderProjectPage(sampleProject(), { name: '테스트중학교' }, PROJECT_SECTION.OVERVIEW);
  const headcount = html.indexOf('<legend>인원</legend>');
  const student = html.indexOf('<legend>체험처/비용(학생용)</legend>');
  const staff = html.indexOf('<legend>체험처/비용(인솔자용)</legend>');
  const budget = html.indexOf('<legend>예산</legend>');

  assert.ok(headcount < student);
  assert.ok(student < staff);
  assert.ok(staff < budget);
});

test('사업 화면의 기본 진입은 현장체험학습 업무 흐름이다', () => {
  const html = renderProjectPage(sampleProject(), { name: '테스트중학교' });
  assert.match(html, /data-project-view="workflow"/);
  assert.match(html, /현장체험학습 업무 흐름/);
});

test('업무 흐름 화면은 문서 참고값, 반납 대조, 공식 XLSX와 인쇄 경로를 연결한다', () => {
  const html = renderProjectPage(sampleProject(), { name: '익명 학교', schoolYear: 2026 });
  assert.match(html, /운영위원회 제안서 참고값/);
  assert.match(html, /문서 기재값과 현재 계산 비교/);
  assert.match(html, /지원금 잔액과 실제 반납 대조/);
  assert.match(html, /data-action="export-workbook"/);
  assert.match(html, /data-action="print-workflow"/);
  assert.match(html, /workflow-print-only/);
  assert.match(newSourceRowHtml(), /data-resource-field="returnRequired"/);
  assert.match(newSourceRowHtml(), /<option value="student"[^>]*>학생 부담<\/option>/);
});

test('학생용 비용을 인솔자용으로 복사하면 새 ID를 사용하고 세부정보를 복제한다', () => {
  const project = sampleProject();
  project.expenses[0].details = {
    arrivalTime: '08:30',
    departureTime: '09:00',
    address: '부산광역시 예시로 1',
    contact: '010-0000-0000'
  };

  const copied = cloneExpensesForStaff(project.expenses);

  assert.equal(copied.length, project.expenses.length);
  assert.notEqual(copied[0].id, project.expenses[0].id);
  assert.deepEqual(copied[0].details, project.expenses[0].details);
  copied[0].details.address = '수정된 주소';
  assert.equal(project.expenses[0].details.address, '부산광역시 예시로 1');
});
