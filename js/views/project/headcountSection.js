import { number } from '../../utils.js';
import { renderHeadcountReport } from './summaryViews.js';

export function renderHeadcountSection(project) {
  return `
    <fieldset class="section-fieldset" data-project-section="headcount">
      <legend>인원</legend>
      <button type="button" class="section-save" data-action="save-headcount">저장</button>
      <div class="form-grid">
        <label for="totalStudents">전체 재적 학생 수</label>
        <input id="totalStudents" name="totalStudents" type="number" min="0" step="1" value="${number(project.totalStudents)}">
      </div>
      ${renderHeadcountReport(project)}
    </fieldset>`;
}
