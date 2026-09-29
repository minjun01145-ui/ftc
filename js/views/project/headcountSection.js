import { escapeHtml, number } from '../../utils.js';
import { summarizeAttendance } from '../../workflowEngine.js';

const GRADES = [1, 2, 3];

export function gradeStudentCount(school, grade) {
  return GRADES.includes(Number(grade)) ? Math.max(0, number(school?.[`grade${grade}Students`])) : 0;
}

export function headcountInputValues(project) {
  const summary = summarizeAttendance(project.workflow?.attendance ?? {}, project.totalStudents);
  return {
    participants: summary.participants,
    regularDayAbsent: summary.regularAbsent,
    vulnerableDayAbsent: summary.vulnerableAbsent,
    vulnerableParticipants: summary.vulnerableParticipants,
    chaperones: summary.chaperones
  };
}

export function headcountIssues({ totalStudents, participants, regularDayAbsent = 0, vulnerableDayAbsent = 0, vulnerableParticipants }) {
  const isCount = value => Number.isInteger(value) && value >= 0;
  if (!isCount(participants)) return ['실제 참여 학생 수는 0 이상의 정수여야 합니다.'];
  if (!isCount(regularDayAbsent)) return ['신청 후 불참(비취약계층) 인원은 0 이상의 정수여야 합니다.'];
  if (!isCount(vulnerableDayAbsent)) return ['신청 후 불참(취약계층) 인원은 0 이상의 정수여야 합니다.'];
  if (!isCount(vulnerableParticipants)) return ['취약계층 참여 인원은 0 이상의 정수여야 합니다.'];
  const dayAbsent = regularDayAbsent + vulnerableDayAbsent;
  if (participants + dayAbsent > 0 && totalStudents <= 0) {
    return ['대상 학년을 선택하고, 기본정보에서 해당 학년 학생수를 먼저 저장해 주세요.'];
  }
  if (participants + dayAbsent > totalStudents) {
    return [`실제 참여 ${participants}명과 신청 후 불참 ${dayAbsent}명의 합이 해당 학년 학생수 ${totalStudents}명을 초과합니다.`];
  }
  if (vulnerableParticipants > participants) {
    return [`취약계층 참여 인원 ${vulnerableParticipants}명이 실제 참여 학생 수 ${participants}명을 초과합니다.`];
  }
  return [];
}

/**
 * 인원 화면 입력값을 업무 흐름 인원 구조(core-v1)로 바꾼다.
 * 신청 = 실제 참여 + 신청 후 불참, 해당 학년 학생수에서 신청을 뺀 나머지는 불참(미신청)이다.
 * 신청 후 불참(업무 흐름의 '당일 불참')은 취약/비취약을 나누어 받는다.
 */
export function headcountAttendance(previousAttendance, previousTotal, {
  participants, regularDayAbsent = 0, vulnerableDayAbsent = 0, vulnerableParticipants, chaperones = null
}) {
  const legacy = previousAttendance.schema === 'legacy-v5' || previousAttendance.legacyAttendance
    ? { legacyAttendance: previousAttendance.legacyAttendance ?? previousAttendance }
    : {};
  return {
    schema: 'core-v1',
    applicants: participants + regularDayAbsent + vulnerableDayAbsent,
    chaperones: chaperones ?? summarizeAttendance(previousAttendance, previousTotal).chaperones,
    vulnerableEnrolled: vulnerableParticipants + vulnerableDayAbsent,
    vulnerableNotApplied: 0,
    vulnerableDayAbsent,
    regularDayAbsent,
    ...legacy
  };
}

function countInput(value) {
  const text = String(value ?? '').trim();
  return text === '' ? 0 : Number(text);
}

/** 폼에 인원 입력칸이 없으면 null을 돌려준다. */
export function readHeadcountInputs(data) {
  if (!data.has('actualParticipants')) return null;
  return {
    participants: countInput(data.get('actualParticipants')),
    regularDayAbsent: countInput(data.get('dayAbsentStudents')),
    vulnerableDayAbsent: countInput(data.get('vulnerableDayAbsentStudents')),
    vulnerableParticipants: countInput(data.get('vulnerableParticipants')),
    chaperones: data.has('chaperones') ? Math.max(0, Math.floor(countInput(data.get('chaperones')) || 0)) : null,
    dayAbsentSharesCommonCost: data.has('dayAbsentSharesCommonCost')
  };
}

export function renderHeadcountSection(project, school = {}) {
  const grade = GRADES.includes(Number(project.grade)) ? Number(project.grade) : '';
  const gradeOptions = GRADES.map(value => `<option value="${value}" ${value === grade ? 'selected' : ''}>${value}학년</option>`).join('');
  const gradeTotal = grade ? gradeStudentCount(school, grade) : '';
  const values = headcountInputValues(project);
  const notApplied = gradeTotal === '' ? '' : Math.max(0, gradeTotal - values.participants - values.regularDayAbsent - values.vulnerableDayAbsent);

  return `
    <fieldset class="section-fieldset" data-project-section="headcount">
      <legend>인원</legend>
      <button type="button" class="section-save save-button" data-action="save-headcount">저장</button>
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

        <label for="dayAbsentStudents">신청 후 불참(비취약계층)</label>
        <input id="dayAbsentStudents" name="dayAbsentStudents" type="number" min="0" step="1" value="${number(values.regularDayAbsent)}">
        <label for="vulnerableDayAbsentStudents">신청 후 불참(취약계층)</label>
        <input id="vulnerableDayAbsentStudents" name="vulnerableDayAbsentStudents" type="number" min="0" step="1" value="${number(values.vulnerableDayAbsent)}">

        <label class="checkbox-label" for="dayAbsentSharesCommonCost">
          <input id="dayAbsentSharesCommonCost" name="dayAbsentSharesCommonCost" type="checkbox" ${project.dayAbsentSharesCommonCost ? 'checked' : ''}>
          신청 후 불참자 공통비 부담
        </label>
        <span></span>
        <label for="notAppliedStudents">불참(미신청)</label>
        <input id="notAppliedStudents" type="number" readonly tabindex="-1" value="${escapeHtml(notApplied)}">

        <label for="chaperones">인솔자 수</label>
        <input id="chaperones" name="chaperones" type="number" min="0" step="1" value="${number(values.chaperones)}">
      </div>
    </fieldset>`;
}
