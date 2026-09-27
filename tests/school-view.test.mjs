import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState } from '../js/presets.js';
import { readSchoolForm, renderSchoolPage } from '../js/views/schoolView.js';

test('기본정보 화면에는 학교 조회와 학교 정보 두 fieldset만 있고 요구 학생수 안내를 표시한다', () => {
  const html = renderSchoolPage(defaultState.school);
  assert.equal((html.match(/<fieldset>/g) ?? []).length, 2);
  assert.match(html, /<legend>학교 조회<\/legend>/);
  assert.match(html, /<legend>학교 정보<\/legend>/);
  assert.match(html, /\*학생수는 학교알리미에서 자동으로 불러오므로, 실제 학생수와 비교하여 수정한 후 저장해 주십시오\./);
  assert.doesNotMatch(html, /사업별 학교 지원 배정|budgetAmount:|budgetFixed:|school-budget-row/);
  assert.doesNotMatch(html, /lookup-school-students|schoolInfoStatus|학교알리미 학생수 조회/);
});

test('학교 폼을 읽어도 기존 legacy projectBudgets를 수정하지 않는다', () => {
  const previous = {
    ...defaultState.school,
    projectBudgets: { oldProject: { amount: 123456, fixed: true, targetBurden: 100 } },
    annualSchoolBudget: 4000000
  };
  const savedFormData = globalThis.FormData;
  globalThis.FormData = class TestFormData {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values[name] ?? null; }
  };

  try {
    const next = readSchoolForm({ values: {
      name: '수정 중학교', homepage: '', educationOffice: 'seobu', schoolCode: '123',
      schoolRegionCode: 'region', schoolKindCode: '03', schoolYear: '2026',
      grade1Students: '10', grade2Students: '20', grade3Students: '30'
    } }, previous);
    assert.deepEqual(next.projectBudgets, previous.projectBudgets);
    assert.equal(next.projectBudgets, previous.projectBudgets);
    assert.equal(next.annualSchoolBudget, previous.annualSchoolBudget);
    assert.equal(next.grade1Students, 10);
  } finally {
    globalThis.FormData = savedFormData;
  }
});
