import { projectCounts } from '../../engine.js';
import { number } from '../../utils.js';
import { renderHeadcountReport, vulnerableStudentTotal } from './summaryViews.js';

export function renderHeadcountSection(project) {
  const counts = projectCounts(project);
  const vulnerableTotal = vulnerableStudentTotal(project);

  return `
    <fieldset class="section-fieldset" data-project-section="headcount">
      <legend>인원</legend>
      <button type="button" class="section-save" data-action="save-headcount">저장</button>
      <p class="section-note">회색 칸은 자동 계산으로, 저장버튼을 누르면 자동으로 계산됩니다.</p>
      <div class="form-grid">
        <label for="totalStudents">총학생수</label>
        <input id="totalStudents" name="totalStudents" type="number" min="0" value="${number(project.totalStudents)}">
        <label for="absentStudents">불참자수</label>
        <input id="absentStudents" name="absentStudents" type="number" min="0" value="${number(project.absentStudents)}">

        <label for="actualParticipants">실제 참가학생수</label>
        <input id="actualParticipants" name="actualParticipants" type="number" value="${counts.participants}" readonly>
        <span></span><span></span>

        <label for="vulnerableStudents">취약계층 학생수</label>
        <input id="vulnerableStudents" name="vulnerableStudents" type="number" min="0" value="${vulnerableTotal}">
        <label for="vulnerableAbsent">취약계층 중 불참자수</label>
        <input id="vulnerableAbsent" name="vulnerableAbsent" type="number" min="0" value="${number(project.vulnerableAbsent)}">

        <label for="chaperones">인솔자수</label>
        <input id="chaperones" name="chaperones" type="number" min="0" value="${number(project.chaperones)}">
      </div>
      ${renderHeadcountReport(project)}
    </fieldset>`;
}
