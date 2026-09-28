import { escapeHtml, number } from '../../utils.js';
import { summarizeAttendance } from '../../workflowEngine.js';
import { renderHeadcountReport } from './summaryViews.js';

const GRADES = [1, 2, 3];

export function gradeStudentCount(school, grade) {
  return GRADES.includes(Number(grade)) ? Math.max(0, number(school?.[`grade${grade}Students`])) : 0;
}

export function headcountInputValues(project) {
  const summary = summarizeAttendance(project.workflow?.attendance ?? {}, project.totalStudents);
  return {
    participants: summary.participants,
    vulnerableParticipants: summary.vulnerableParticipants
  };
}

export function headcountIssues({ totalStudents, participants, vulnerableParticipants }) {
  const isCount = value => Number.isInteger(value) && value >= 0;
  if (!isCount(participants)) return ['실제 참여 학생 수는 0 이상의 정수여야 합니다.'];
  if (!isCount(vulnerableParticipants)) return ['취약계층 참여 인원은 0 이상의 정수여야 합니다.'];
  if (participants > 0 && totalStudents <= 0) {
    return ['대상 학년을 선택하고, 기본정보에서 해당 학년 학생수를 먼저 저장해 주세요.'];
  }
  if (participants > totalStudents) {
    return [`실제 참여 학생 수 ${participants}명이 해당 학년 학생수 ${totalStudents}명을 초과합니다.`];
  }
  if (vulnerableParticipants > participants) {
    return [`취약계층 참여 인원 ${vulnerableParticipants}명이 실제 참여 학생 수 ${participants}명을 초과합니다.`];
  }
  return [];
}

export function renderHeadcountSection(project, school = {}) {
  const grade = GRADES.includes(Number(project.grade)) ? Number(project.grade) : '';
  const gradeOptions = GRADES.map(value => `<option value="${value}" ${value === grade ? 'selected' : ''}>${value}학년</option>`).join('');
  const gradeTotal = grade ? gradeStudentCount(school, grade) : '';
  const values = headcountInputValues(project);

  return `
    <fieldset class="section-fieldset" data-project-section="headcount">
      <legend>인원</legend>
      <button type="button" class="section-save" data-action="save-headcount">저장</button>
      <div class="form-grid">
        <label for="projectGrade">대상 학년</label>
        <select id="projectGrade" name="grade" data-headcount-grade>
          <option value="">학년 선택</option>
          ${gradeOptions}
        </select>
        <label for="totalStudents">해당 학년 학생수</label>
        <input id="totalStudents" name="totalStudents" type="number" readonly tabindex="-1" value="${escapeHtml(gradeTotal)}" title="기본정보의 학년별 학생수에서 불러옵니다.">

        <label for="actualParticipants">실제 참여 학생 수</label>
        <input id="actualParticipants" name="actualParticipants" type="number" min="0" step="1" value="${number(values.participants)}">
        <label for="vulnerableParticipants">참여자 중 취약계층</label>
        <input id="vulnerableParticipants" name="vulnerableParticipants" type="number" min="0" step="1" value="${number(values.vulnerableParticipants)}">
      </div>
      <p class="help">해당 학년 학생수는 기본정보에서 불러오며 여기서 수정할 수 없습니다.</p>
      ${renderHeadcountReport(project)}
    </fieldset>`;
}
