import { escapeHtml, number } from '../utils.js';

export function renderSchoolPage(school) {
  const total = number(school.grade1Students) + number(school.grade2Students) + number(school.grade3Students);
  return `
    <h1>기본정보</h1>
    <form id="schoolForm">
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
          <input readonly value="${total}">
        </div>
      </fieldset>
      <p class="help">학교알리미 자동 조회는 추후 연결합니다. 현재 버전은 직접 입력합니다.</p>
      <div class="page-actions"><button type="submit">저장</button></div>
    </form>
  `;
}

export function readSchoolForm(form, previous) {
  const data = new FormData(form);
  return {
    ...previous,
    name: String(data.get('name') ?? '').trim(),
    homepage: String(data.get('homepage') ?? '').trim(),
    schoolYear: Math.max(0, number(data.get('schoolYear'))),
    grade1Students: Math.max(0, number(data.get('grade1Students'))),
    grade2Students: Math.max(0, number(data.get('grade2Students'))),
    grade3Students: Math.max(0, number(data.get('grade3Students')))
  };
}
