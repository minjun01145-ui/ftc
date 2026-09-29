import { escapeHtml, number } from '../utils.js';
import { saveAllBar } from './projectView.js';

const EDUCATION_OFFICES = [
  ['seobu', '서부교육지원청'],
  ['namBu', '남부교육지원청'],
  ['bukbu', '북부교육지원청'],
  ['dongnae', '동래교육지원청'],
  ['haeundae', '해운대교육지원청']
];

export function renderSchoolPage(school) {
  const total = number(school.grade1Students) + number(school.grade2Students) + number(school.grade3Students);
  const officeOptions = EDUCATION_OFFICES.map(([value, label]) => `
    <option value="${value}" ${school.educationOffice === value ? 'selected' : ''}>${label}</option>
  `).join('');
  return `
    <h1>기본정보</h1>
    <form id="schoolForm">
      ${saveAllBar('submit')}
      <fieldset>
        <legend>학교 조회</legend>
        <div class="school-lookup-grid">
          <label for="educationOffice">교육지원청</label>
          <select id="educationOffice" name="educationOffice">
            <option value="">교육지원청 선택</option>
            ${officeOptions}
          </select>

          <label for="schoolQuery">학교명 검색</label>
          <div class="school-search-controls">
            <input id="schoolQuery" name="schoolQuery" type="search" data-school-search autocomplete="off">
            <button type="button" data-action="search-schools">학교 검색</button>
          </div>
        </div>
        <p id="schoolSearchStatus" role="status" aria-live="polite"></p>
        <div id="schoolSearchResults" class="school-search-results" role="listbox" aria-label="학교 검색 결과"></div>
      </fieldset>
      <fieldset>
        <legend>학교 정보</legend>
        <div class="form-grid">
          <label for="schoolName">학교명</label>
          <input id="schoolName" name="name" type="text" value="${escapeHtml(school.name)}">
          <label for="homepage">학교 홈페이지</label>
          <input id="homepage" name="homepage" type="url" value="${escapeHtml(school.homepage)}">

          <label for="schoolYear">학년도</label>
          <input id="schoolYear" name="schoolYear" type="number" min="0" value="${number(school.schoolYear)}">
          <span></span><span></span>

          <label for="grade1Students">1학년 학생수</label>
          <input id="grade1Students" name="grade1Students" type="number" min="0" value="${number(school.grade1Students)}">
          <label for="grade2Students">2학년 학생수</label>
          <input id="grade2Students" name="grade2Students" type="number" min="0" value="${number(school.grade2Students)}">

          <label for="grade3Students">3학년 학생수</label>
          <input id="grade3Students" name="grade3Students" type="number" min="0" value="${number(school.grade3Students)}">
          <label>전체 학생수</label>
          <input id="schoolTotalStudents" readonly value="${total}">
        </div>
        <p>*학생수는 학교알리미에서 자동으로 불러오므로, 실제 학생수와 비교하여 수정한 후 저장해 주십시오.</p>
        <input type="hidden" name="schoolCode" value="${escapeHtml(school.schoolCode)}">
        <input type="hidden" name="schoolRegionCode" value="${escapeHtml(school.schoolRegionCode)}">
        <input type="hidden" name="schoolKindCode" value="${escapeHtml(school.schoolKindCode)}">
      </fieldset>
      <div class="page-actions"><button type="submit" class="save-button">저장</button></div>
    </form>
  `;
}

export function readSchoolForm(form, previous) {
  const data = new FormData(form);
  return {
    ...previous,
    name: String(data.get('name') ?? '').trim(),
    homepage: String(data.get('homepage') ?? '').trim(),
    educationOffice: String(data.get('educationOffice') ?? '').trim(),
    schoolCode: String(data.get('schoolCode') ?? '').trim(),
    schoolRegionCode: String(data.get('schoolRegionCode') ?? '').trim(),
    schoolKindCode: String(data.get('schoolKindCode') ?? '').trim(),
    schoolYear: Math.max(0, number(data.get('schoolYear'))),
    grade1Students: Math.max(0, number(data.get('grade1Students'))),
    grade2Students: Math.max(0, number(data.get('grade2Students'))),
    grade3Students: Math.max(0, number(data.get('grade3Students')))
  };
}
