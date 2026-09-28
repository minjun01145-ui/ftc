import { buildSettlementReport } from '../../settlementReport.js';
import { escapeHtml, number } from '../../utils.js';

const won = value => (value === '' || value === null || value === undefined ? '미입력' : `${Math.round(number(value)).toLocaleString('ko-KR')}원`);
const people = value => `${number(value).toLocaleString('ko-KR')}명`;

function item(label, value, { strong = false, note = '' } = {}) {
  return `
    <div class="ref-item ${strong ? 'strong' : ''}">
      <span class="ref-label">${escapeHtml(label)}</span>
      <span class="ref-value">${escapeHtml(value)}</span>
      ${note ? `<span class="ref-note">${escapeHtml(note)}</span>` : ''}
    </div>`;
}

function card(title, body) {
  return `<section class="ref-card"><h3>${escapeHtml(title)}</h3>${body}</section>`;
}

export function renderSettlementSection(project, school = {}) {
  const { values, warnings } = buildSettlementReport(project, school);
  const basics = [values.schoolName, values.grade === '' ? '' : `${values.grade}학년`, values.executionMode, values.period && `${values.period}(${values.days}일)`, values.place]
    .filter(Boolean).join(' · ');

  return `
    <section class="settlement-helper" data-project-section="settlement">
      ${basics ? `<p class="settlement-basics">${escapeHtml(basics)}</p>` : ''}
      ${warnings.length ? `<ul class="settlement-warnings">${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}

      <div class="ref-cards">
        ${card('인원', `
          ${item('해당학년 총 학생수', people(values.totalStudents))}
          ${item('참여인원(취약계층 제외)', people(values.regularParticipants))}
          ${item('취약계층 참여인원', people(values.vulnerableParticipants))}
          ${item('참여인원 계', people(values.participants), { strong: true })}
        `)}
        ${card('1인당 비용', `
          ${item('1인당 현장체험학습비', won(values.perPerson), { strong: true })}
          ${values.dayAbsentCommonCost > 0 ? item('당일 불참자 공통경비', won(values.dayAbsentCommonCost)) : ''}
        `)}
        ${card('교육청 지원금', `
          ${item('교부액', won(values.grantTotal))}
          ${item('집행액', won(values.executed), { strong: true })}
          ${item('잔액(원단위 절사)', won(values.balance))}
        `)}
        ${card('지원금 외 부담액', `
          ${item('학교부담', won(values.schoolBurden))}
          ${item('학생부담', won(values.studentBurden))}
          ${item('외부지원', won(values.externalSupport))}
          ${item('소계', won(values.burdenSubtotal), { strong: true })}
        `)}
      </div>

      <section class="ref-card">
        <h3>비고 참고 문구</h3>
        <pre class="settlement-remarks">${escapeHtml(values.remarks || '(비고에 적을 내용이 없습니다)')}</pre>
        ${values.remarks ? `<button type="button" class="small-button no-print" data-action="copy-text" data-copy-text="${escapeHtml(values.remarks)}">비고 복사</button>` : ''}
      </section>
      <div class="page-actions no-print"><button type="button" data-action="print">인쇄</button></div>
    </section>`;
}
