import { escapeHtml } from '../../utils.js';

export function renderBusinessInfoSection(project, school) {
  return `
    <fieldset class="section-fieldset" data-project-section="business">
      <legend>사업정보</legend>
      <button type="button" class="section-save" data-action="save-business">저장</button>
      <div class="form-grid">
        <label for="projectTitle">사업명</label>
        <input id="projectTitle" name="title" type="text" value="${escapeHtml(project.title)}">
        <label>학교명</label>
        <input readonly value="${escapeHtml(school.name)}">

        <label for="startDate">시작일</label>
        <input id="startDate" name="startDate" type="date" value="${escapeHtml(project.startDate)}">
        <label for="endDate">종료일</label>
        <input id="endDate" name="endDate" type="date" value="${escapeHtml(project.endDate)}">
      </div>
    </fieldset>`;
}
