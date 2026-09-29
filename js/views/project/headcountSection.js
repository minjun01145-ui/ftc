import { escapeHtml, number } from '../../utils.js';
import { summarizeAttendance } from '../../workflowEngine.js';

const GRADES = [1, 2, 3];

export function gradeStudentCount(school, grade) {
  return GRADES.includes(Number(grade)) ? Math.max(0, number(school?.[`grade${grade}Students`])) : 0;
}

export function headcountInputValues(project) {
  const summary = summarizeAttendance(project.workflow?.attendance ?? {}, project.totalStudents);
  return {
    applicants: summary.participants + summary.regularAbsent + summary.vulnerableAbsent,
    vulnerableApplicants: summary.vulnerableParticipants + summary.vulnerableAbsent,
    regularDayAbsent: summary.regularAbsent,
    vulnerableDayAbsent: summary.vulnerableAbsent,
    chaperones: summary.chaperones
  };
}

/** 신청자 수에서 신청 후 불참을 뺀 실제 참여 인원(비취약·취약). */
export function headcountParticipants({ applicants, vulnerableApplicants, regularDayAbsent = 0, vulnerableDayAbsent = 0 }) {
  const vulnerable = Math.max(0, vulnerableApplicants - vulnerableDayAbsent);
  const regular = Math.max(0, applicants - vulnerableApplicants - regularDayAbsent);
  return { regular, vulnerable, total: regular + vulnerable };
}

export function headcountIssues({ totalStudents, applicants, vulnerableApplicants = 0, regularDayAbsent = 0, vulnerableDayAbsent = 0 }) {
  const isCount = value => Number.isInteger(value) && value >= 0;
  if (!isCount(applicants)) return ['신청자 수는 0 이상의 정수여야 합니다.'];
  if (!isCount(vulnerableApplicants)) return ['신청자 중 취약계층 인원은 0 이상의 정수여야 합니다.'];
  if (!isCount(regularDayAbsent)) return ['신청 후 불참(비취약계층) 인원은 0 이상의 정수여야 합니다.'];
  if (!isCount(vulnerableDayAbsent)) return ['신청 후 불참(취약계층) 인원은 0 이상의 정수여야 합니다.'];
  if (applicants > 0 && totalStudents <= 0) {
    return ['대상 학년을 선택하고, 기본정보에서 해당 학년 학생수를 먼저 저장해 주세요.'];
  }
  if (applicants > totalStudents) {
    return [`신청자 ${applicants}명이 해당 학년 학생수 ${totalStudents}명을 초과합니다.`];
  }
  if (vulnerableApplicants > applicants) {
    return [`신청자 중 취약계층 ${vulnerableApplicants}명이 신청자 수 ${applicants}명을 초과합니다.`];
  }
  if (vulnerableDayAbsent > vulnerableApplicants) {
    return [`신청 후 불참(취약계층) ${vulnerableDayAbsent}명이 취약계층 신청자 ${vulnerableApplicants}명을 초과합니다.`];
  }
  if (regularDayAbsent > applicants - vulnerableApplicants) {
    return [`신청 후 불참(비취약계층) ${regularDayAbsent}명이 비취약계층 신청자 ${applicants - vulnerableApplicants}명을 초과합니다.`];
  }
  return [];
}

/**
 * 인원 화면 입력값을 업무 흐름 인원 구조(core-v1)로 바꾼다.
 * 실제 참여 = 신청자 − 신청 후 불참, 해당 학년 학생수에서 신청자를 뺀 나머지는 불참(미신청)이다.
 * 신청 후 불참(업무 흐름의 '당일 불참')은 취약/비취약을 나누어 받는다.
 */
export function headcountAttendance(previousAttendance, previousTotal, {
  applicants, vulnerableApplicants, regularDayAbsent = 0, vulnerableDayAbsent = 0, chaperones = null
}) {
  const legacy = previousAttendance.schema === 'legacy-v5' || previousAttendance.legacyAttendance
    ? { legacyAttendance: previousAttendance.legacyAttendance ?? previousAttendance }
    : {};
  return {
    schema: 'core-v1',
    applicants,
    chaperones: chaperones ?? summarizeAttendance(previousAttendance, previousTotal).chaperones,
    vulnerableEnrolled: vulnerableApplicants,
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
  if (!data.has('applicants')) return null;
  return {
    applicants: countInput(data.get('applicants')),
    vulnerableApplicants: countInput(data.get('vulnerableApplicants')),
    regularDayAbsent: countInput(data.get('dayAbsentStudents')),
    vulnerableDayAbsent: countInput(data.get('vulnerableDayAbsentStudents')),
    chaperones: data.has('chaperones') ? Math.max(0, Math.floor(countInput(data.get('chaperones')) || 0)) : null,
    dayAbsentSharesCommonCost: data.has('dayAbsentSharesCommonCost')
  };
}

export function participantsText({ regular, vulnerable, total }) {
  return `${total}명 (비취약계층 ${regular}명, 취약계층 ${vulnerable}명)`;
}

/** 입력하는 동안 불참(미신청)과 실제 참여 인원을 바로 다시 계산해 보여 준다. */
export function refreshHeadcountSummary(form) {
  const summary = form?.querySelector('[data-participants-summary]');
  if (!summary) return;
  const value = name => countInput(form.elements[name]?.value);
  const values = {
    applicants: value('applicants'),
    vulnerableApplicants: value('vulnerableApplicants'),
    regularDayAbsent: value('dayAbsentStudents'),
    vulnerableDayAbsent: value('vulnerableDayAbsentStudents')
  };
  summary.textContent = participantsText(headcountParticipants(values));
  const total = form.elements.totalStudents?.value;
  const notApplied = form.elements.notAppliedStudents ?? form.querySelector('#notAppliedStudents');
  if (notApplied) notApplied.value = total === '' || total == null ? '' : String(Math.max(0, Number(total) - values.applicants));
}

export function renderHeadcountSection(project, school = {}) {
  const grade = GRADES.includes(Number(project.grade)) ? Number(project.grade) : '';
  const gradeOptions = GRADES.map(value => `<option value="${value}" ${value === grade ? 'selected' : ''}>${value}학년</option>`).join('');
  const gradeTotal = grade ? gradeStudentCount(school, grade) : '';
  const values = headcountInputValues(project);
  const notApplied = gradeTotal === '' ? '' : Math.max(0, gradeTotal - values.applicants);
  const participants = headcountParticipants(values);

  return `
    <fieldset class="section-fieldset" data-project-section="headcount">
      <legend>인원</legend>
      <div class="form-grid">
        <label for="projectGrade">대상 학년</label>
        <select id="projectGrade" name="grade" data-headcount-grade>
          <option value="">학년 선택</option>
          ${gradeOptions}
        </select>
        <label for="totalStudents">해당 학년 학생수</label>
        <input id="totalStudents" name="totalStudents" type="number" readonly tabindex="-1" value="${escapeHtml(gradeTotal)}" title="기본정보의 학년별 학생수에서 불러옵니다.">

        <label for="applicants">신청자 수</label>
        <input id="applicants" name="applicants" type="number" min="0" step="1" value="${number(values.applicants)}" data-headcount-input>
        <label for="vulnerableApplicants">신청자 중 취약계층</label>
        <input id="vulnerableApplicants" name="vulnerableApplicants" type="number" min="0" step="1" value="${number(values.vulnerableApplicants)}" data-headcount-input>

        <label for="dayAbsentStudents">신청 후 불참(비취약계층)</label>
        <input id="dayAbsentStudents" name="dayAbsentStudents" type="number" min="0" step="1" value="${number(values.regularDayAbsent)}" data-headcount-input>
        <label for="vulnerableDayAbsentStudents">신청 후 불참(취약계층)</label>
        <input id="vulnerableDayAbsentStudents" name="vulnerableDayAbsentStudents" type="number" min="0" step="1" value="${number(values.vulnerableDayAbsent)}" data-headcount-input>

        <span></span>
        <label class="checkbox-label inline-check" for="dayAbsentSharesCommonCost">
          <input id="dayAbsentSharesCommonCost" name="dayAbsentSharesCommonCost" type="checkbox" ${project.dayAbsentSharesCommonCost ? 'checked' : ''}>
          신청 후 불참자 공통비 부담
        </label>
        <label for="notAppliedStudents">불참(미신청)</label>
        <input id="notAppliedStudents" type="number" readonly tabindex="-1" value="${escapeHtml(notApplied)}">

        <label for="chaperones">인솔자 수</label>
        <input id="chaperones" name="chaperones" type="number" min="0" step="1" value="${number(values.chaperones)}">
        <span></span><span></span>

        <label for="participantsSummary">실제 참여</label>
        <output id="participantsSummary" class="headcount-summary" data-participants-summary>${participantsText(participants)}</output>
      </div>
    </fieldset>`;
}
