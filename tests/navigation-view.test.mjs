import assert from 'node:assert/strict';
import test from 'node:test';
import { PROJECT_SECTION, PROJECT_SECTION_ITEMS, normalizeProjectSection } from '../js/projectSections.js';
import { sampleProject } from '../js/presets.js';
import { renderProjectPage } from '../js/views/projectView.js';
import { renderProjectList } from '../js/views/sidebarView.js';

const school = { name: '테스트중학교' };

test('사업 하위메뉴는 전체보기 없이 예산 다음에 학생 1인별 금액 산출내역과 품의 도우미를 둔다', () => {
  assert.deepEqual(PROJECT_SECTION_ITEMS.map(item => item.label), [
    '사업정보', '인원', '체험처/비용', '예산 관리', '학생 1인별 금액 산출내역 보기', '품의 도우미', '리포트 보기', '정산'
  ]);
  assert.equal(normalizeProjectSection('workflow'), PROJECT_SECTION.BUSINESS);
  assert.equal(normalizeProjectSection('overview'), PROJECT_SECTION.BUSINESS);
  assert.equal(normalizeProjectSection('없는메뉴'), PROJECT_SECTION.BUSINESS);
});

test('사업 목록의 각 사업에는 삭제 버튼이 있다', () => {
  const html = renderProjectList([sampleProject()], { type: 'school' });
  assert.match(html, /data-delete-project-id="[^"]+"/);
});

test('선택된 사업 아래에만 하위메뉴가 렌더링된다', () => {
  const p1 = sampleProject();
  const p2 = { ...sampleProject(), id: 'project-2', title: '두 번째 사업' };
  const html = renderProjectList([p1, p2], { type: 'project', projectId: p1.id, section: PROJECT_SECTION.BUDGET });

  assert.equal((html.match(/class="project-submenu"/g) ?? []).length, 1);
  assert.match(html, /data-project-section="budget"[^>]*>예산 관리<\/button>/);
  assert.match(html, /project-subitem active[^>]*data-project-section="budget"/);
  assert.doesNotMatch(html, /data-project-section="workflow"/);
});

test('사업정보 화면은 사업정보만 보여주고 다른 편집 섹션은 렌더링하지 않는다', () => {
  const html = renderProjectPage(sampleProject(), school, PROJECT_SECTION.BUSINESS);
  assert.match(html, /<legend>사업정보<\/legend>/);
  assert.doesNotMatch(html, /<legend>인원<\/legend>/);
  assert.doesNotMatch(html, /체험처\/비용\(학생용\)/);
  assert.doesNotMatch(html, /<legend>예산<\/legend>/);
});

test('기본 사업 진입과 legacy workflow 경로는 사업정보로 정규화한다', () => {
  const project = sampleProject();
  const defaultHtml = renderProjectPage(project, school);
  const legacyHtml = renderProjectPage(project, school, PROJECT_SECTION.WORKFLOW);
  assert.match(defaultHtml, /data-project-view="business"/);
  assert.match(legacyHtml, /data-project-view="business"/);
  assert.doesNotMatch(defaultHtml, /data-project-view="workflow"|현장체험학습 업무 흐름/);
});

test('체험처 비용 화면은 학생용과 인솔자용을 함께 보여준다', () => {
  const html = renderProjectPage(sampleProject(), school, PROJECT_SECTION.EXPENSES);
  assert.match(html, /체험처\/비용\(학생용\)/);
  assert.match(html, /체험처\/비용\(인솔자용\)/);
  assert.doesNotMatch(html, /<legend>예산<\/legend>/);
});

test('예산 관리 화면은 교육청 지원금과 기타 지원금만 보여 준다', () => {
  const html = renderProjectPage(sampleProject(), school, PROJECT_SECTION.BUDGET);
  assert.match(html, /<legend>예산<\/legend>/);
  assert.match(html, /<h3>교육청 지원금<\/h3>/);
  assert.match(html, /<h3>기타 지원금<\/h3>/);
  assert.match(html, /교육청 지원금 교부액<small>\(잔액 정산용\)<\/small>/);
  assert.match(html, /value="학교 자체지원금"/);
  assert.equal((html.match(/class="budget-memo"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /지정 항목 전용/);
  assert.doesNotMatch(html, /계획 계산|계획 재원 배분/);
});

test('시행 전 데이터와 품의 도우미 화면을 렌더링한다', () => {
  const preTrip = renderProjectPage(sampleProject(), school, PROJECT_SECTION.PRE_TRIP);
  const proposal = renderProjectPage(sampleProject(), school, PROJECT_SECTION.PROPOSAL);
  assert.match(preTrip, /학생 1인별 금액 산출 내역/);
  assert.match(preTrip, /해당 항목 총액/);
  assert.match(proposal, /사용 방법/);
  assert.match(proposal, /<h3>교육청 지원금\(취약계층\)<\/h3>/);
  assert.match(proposal, /<h3>교육청 지원금\(비취약계층\)<\/h3>/);
  assert.match(proposal, /<h3>기타 지원금\(학교 자체지원금\)<\/h3>/);
  assert.match(proposal, /<h3>수익자 부담<\/h3>/);
  assert.match(proposal, /data-proposal-toggle/);
  assert.match(proposal, /<legend>예산별 품의 내용<\/legend>/);
});

test('정산 화면에는 정산 결과만 표시하고 계획 재원 배분은 표시하지 않는다', () => {
  const html = renderProjectPage(sampleProject(), school, PROJECT_SECTION.SETTLEMENT);
  assert.match(html, /<h2>정산<\/h2>/);
  assert.match(html, /<h2>정산 재원 배분<\/h2>/);
  assert.doesNotMatch(html, /<h2>계획 재원 배분<\/h2>/);
});
