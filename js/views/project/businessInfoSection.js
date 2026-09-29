import { escapeHtml } from '../../utils.js';

export const EXECUTION_MODES = Object.freeze(['숙박형', '일일형', '혼합형']);

export function renderBusinessInfoSection(project, school) {
  const modes = EXECUTION_MODES
    .map(mode => `<option value="${mode}" ${mode === project.executionMode ? 'selected' : ''}>${mode}</option>`)
    .join('');
  return `
    <fieldset class="section-fieldset" data-project-section="business">
      <legend>사업정보</legend>
      <div class="form-grid">
        <label for="projectTitle">사업명</label>
        <input id="projectTitle" name="title" type="text" value="${escapeHtml(project.title)}">
        <label for="schoolName">학교명</label>
        <input id="schoolName" name="schoolName" type="text" value="${escapeHtml(school?.name ?? '')}">

        <label for="startDate">시작일</label>
        <input id="startDate" name="startDate" type="date" value="${escapeHtml(project.startDate)}">
        <label for="endDate">종료일</label>
        <input id="endDate" name="endDate" type="date" value="${escapeHtml(project.endDate)}">

        <label for="executionMode">추진방식</label>
        <select id="executionMode" name="executionMode">${modes}</select>
        <label for="place">장소</label>
        <input id="place" name="place" type="text" value="${escapeHtml(project.place)}" placeholder="예: 서울">
      </div>
    </fieldset>`;
}
