import assert from 'node:assert/strict';
import test from 'node:test';
import { PROJECT_SECTION, PROJECT_SECTION_ITEMS, normalizeProjectSection } from '../js/projectSections.js';
import { sampleProject } from '../js/presets.js';
import { renderProjectPage } from '../js/views/projectView.js';
import { renderProjectList } from '../js/views/sidebarView.js';

const school = { name: '테스트중학교' };

test('사업 하위메뉴는 요청한 7개 항목을 고정 순서로 제공한다', () => {
  assert.deepEqual(PROJECT_SECTION_ITEMS.map(item => item.label), [
    '전체보기', '사업정보', '인원', '체험처/비용', '예산 관리', '리포트 보기', '정산'
  ]);
  assert.equal(normalizeProjectSection('없는메뉴'), PROJECT_SECTION.OVERVIEW);
});

test('선택된 사업 아래에만 하위메뉴가 렌더링된다', () => {
  const p1 = sampleProject();
  const p2 = { ...sampleProject(), id: 'project-2', title: '두 번째 사업' };
  const html = renderProjectList([p1, p2], { type: 'project', projectId: p1.id, section: PROJECT_SECTION.BUDGET });

  assert.equal((html.match(/class="project-submenu"/g) ?? []).length, 1);
  assert.match(html, /data-project-section="budget"[^>]*>예산 관리<\/button>/);
  assert.match(html, /project-subitem active[^>]*data-project-section="budget"/);
});

test('사업정보 화면은 사업정보만 보여주고 다른 편집 섹션은 렌더링하지 않는다', () => {
  const html = renderProjectPage(sampleProject(), school, PROJECT_SECTION.BUSINESS);
  assert.match(html, /<legend>사업정보<\/legend>/);
  assert.doesNotMatch(html, /<legend>인원<\/legend>/);
  assert.doesNotMatch(html, /체험처\/비용\(학생용\)/);
  assert.doesNotMatch(html, /<legend>예산<\/legend>/);
});

test('체험처 비용 화면은 학생용과 인솔자용을 함께 보여준다', () => {
  const html = renderProjectPage(sampleProject(), school, PROJECT_SECTION.EXPENSES);
  assert.match(html, /체험처\/비용\(학생용\)/);
  assert.match(html, /체험처\/비용\(인솔자용\)/);
  assert.doesNotMatch(html, /<legend>예산<\/legend>/);
});

test('예산 관리 화면에 계획 계산과 계획 재원 배분이 포함된다', () => {
  const html = renderProjectPage(sampleProject(), school, PROJECT_SECTION.BUDGET);
  assert.match(html, /<legend>예산<\/legend>/);
  assert.match(html, /<h2>계획 계산<\/h2>/);
  assert.match(html, /<h2>계획 재원 배분<\/h2>/);
  assert.doesNotMatch(html, /<h2>정산<\/h2>/);
});

test('정산 화면에는 정산 결과만 표시하고 계획 재원 배분은 표시하지 않는다', () => {
  const html = renderProjectPage(sampleProject(), school, PROJECT_SECTION.SETTLEMENT);
  assert.match(html, /<h2>정산<\/h2>/);
  assert.match(html, /<h2>정산 재원 배분<\/h2>/);
  assert.doesNotMatch(html, /<h2>계획 재원 배분<\/h2>/);
});
