import { projectCounts } from './engine.js';
import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, VULNERABLE_BUDGET_ID, buildProposal } from './proposalPlanner.js';
import { number } from './utils.js';

/**
 * 교육청 '(초6·중2·고2) 현장체험학습비 지원금 정산 서식' 7행에 들어갈 값.
 * 열 순서와 안내 문구는 서식 파일(B~X열, 셀 메모)을 그대로 따른다.
 * 품의 도우미의 예산 배정 결과를 쓰므로, 시행 후 인원·비용을 실제대로 고친 뒤 확인한다.
 */
export const SETTLEMENT_COLUMNS = Object.freeze([
  { col: 'B', key: 'schoolName', label: '학교명(정식명칭)' },
  { col: 'C', key: 'schoolLevel', label: '급별(초/중/고)' },
  { col: 'D', key: 'establishment', label: '설립별(공립/사립)' },
  { col: 'E', key: 'grade', label: '대상학년' },
  { col: 'F', key: 'executionMode', label: '추진방식' },
  { col: 'G', key: 'period', label: '기간', merged: 'G:H', hint: '실시한 일자 모두 기재, 연도는 생략' },
  { col: 'I', key: 'days', label: '일수' },
  { col: 'J', key: 'place', label: '장소' },
  { col: 'K', key: 'totalStudents', label: '해당학년 총 학생수' },
  { col: 'L', key: 'regularParticipants', label: '전체 참여인원(취약계층 제외)', hint: '취약계층 해당자는 별도 칸(M)에 입력' },
  { col: 'M', key: 'vulnerableParticipants', label: '취약계층 참여인원(A)' },
  { col: 'N', key: 'participants', label: '참여인원 계', formula: true },
  { col: 'O', key: 'perPerson', label: '1인당 현장체험학습비', merged: 'O:P', hint: '교육청 지원 상한액이 아닌 실제 학교 1인당 단가' },
  { col: 'Q', key: 'grantTotal', label: '지원금 교부액' },
  { col: 'R', key: 'executed', label: '지원금 집행액' },
  { col: 'S', key: 'balance', label: '잔액(원단위 절사)', formula: true },
  { col: 'T', key: 'schoolBurden', label: '지원금 외 부담액 - 학교부담', hint: '1인당 단가가 아닌 총액, 교직원 인솔비 제외' },
  { col: 'U', key: 'studentBurden', label: '지원금 외 부담액 - 학생부담', hint: '1인당 단가가 아닌 총액, 교직원 인솔비 제외' },
  { col: 'V', key: 'externalSupport', label: '지원금 외 부담액 - 외부지원', hint: '1인당 단가가 아닌 총액, 교직원 인솔비 제외' },
  { col: 'W', key: 'burdenSubtotal', label: '지원금 외 부담액 - 소계', formula: true },
  { col: 'X', key: 'remarks', label: '비고' }
]);

const won = value => `${Math.round(number(value)).toLocaleString('ko-KR')}원`;

function parseDate(text) {
  const match = String(text ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

export function periodText(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate) ?? start;
  if (!start) return '';
  const format = date => `${date.getMonth() + 1}.${date.getDate()}.`;
  return start.getTime() === end.getTime() ? format(start) : `${format(start)}~${format(end)}`;
}

export function dayCount(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate) ?? start;
  if (!start || end < start) return '';
  return Math.round((end - start) / 86_400_000) + 1;
}

function supportRemarks(title, blocks) {
  const used = blocks.filter(block => block.total > 0);
  if (!used.length) return [];
  const lines = [`${title}:`];
  for (const block of used) {
    const name = block.budget.name.replace(/^기타 지원금\((.*)\)$/, '$1');
    lines.push(`- ${name}(1인당 ${won(block.usedPerPerson)} * ${block.budget.count}명 = ${won(block.total)})`);
  }
  if (used.length > 1) {
    lines.push(`- ${used.map(block => won(block.total)).join(' + ')} = ${won(used.reduce((sum, block) => sum + block.total, 0))}`);
  }
  return lines;
}

export function buildSettlementReport(project, school = {}) {
  const proposal = buildProposal(project);
  const counts = projectCounts(project);
  const otherBlocks = proposal.blocks.filter(block => ![VULNERABLE_BUDGET_ID, EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID].includes(block.budget.id));
  const schoolBlocks = otherBlocks.filter(block => block.budget.source !== 'external');
  const externalBlocks = otherBlocks.filter(block => block.budget.source === 'external');
  const studentBlock = proposal.blocks.find(block => block.budget.id === STUDENT_BUDGET_ID);

  const schoolBurden = schoolBlocks.reduce((sum, block) => sum + block.total, 0);
  const externalSupport = externalBlocks.reduce((sum, block) => sum + block.total, 0);
  const studentBurden = studentBlock.total + proposal.vulnerableBurden.total;
  const grantTotal = proposal.education.grantTotal;

  const remarks = [
    ...supportRemarks('학교 자체 지원', schoolBlocks),
    ...supportRemarks('외부 지원', externalBlocks)
  ];
  if (proposal.dayAbsentTotal > 0) {
    if (remarks.length) remarks.push('');
    remarks.push(`당일 불참자 공통경비(${proposal.dayAbsent.map(item => item.name).join(', ')}): ${won(proposal.dayAbsentTotal)}`);
  }

  const values = {
    schoolName: String(school.name ?? ''),
    schoolLevel: String(project.schoolLevel ?? ''),
    establishment: String(project.establishment ?? ''),
    grade: project.grade === '' || project.grade == null ? '' : Number(project.grade),
    executionMode: String(project.executionMode ?? ''),
    period: periodText(project.startDate, project.endDate),
    days: dayCount(project.startDate, project.endDate),
    place: String(project.place ?? ''),
    totalStudents: counts.total,
    regularParticipants: counts.regularParticipants,
    vulnerableParticipants: counts.vulnerableParticipants,
    participants: counts.participants,
    perPerson: proposal.perPersonTotal,
    grantTotal: grantTotal ?? '',
    executed: proposal.education.total,
    balance: grantTotal === null ? '' : Math.floor((grantTotal - proposal.education.total) / 10) * 10,
    schoolBurden,
    studentBurden,
    externalSupport,
    burdenSubtotal: schoolBurden + studentBurden + externalSupport,
    remarks: remarks.join('\n')
  };

  const warnings = [];
  if (proposal.unassignedTotal > 0) warnings.push(`품의 도우미에서 아직 배정하지 않은 금액 ${won(proposal.unassignedTotal)}이 있어 부담액이 정확하지 않습니다.`);
  if (grantTotal === null) warnings.push('예산 관리에서 교육청 지원금 교부액을 입력하면 잔액이 계산됩니다.');
  if (grantTotal !== null && values.balance < 0) warnings.push('집행액이 교부액보다 많습니다.');
  if (!values.schoolName) warnings.push('기본정보에서 학교명을 입력해 주세요.');
  if (!values.period) warnings.push('사업정보에서 시작일·종료일을 입력해 주세요.');
  if (!values.place) warnings.push('사업정보에서 장소를 입력해 주세요.');
  if (values.grade === '') warnings.push('인원에서 대상 학년을 선택해 주세요.');

  return { values, warnings };
}

/** 엑셀에 붙여넣을 수 있는 한 줄(B~X). 병합된 H, P열은 비워 둔다. 여러 줄 비고는 따옴표로 감싼다. */
export function settlementRowTsv(values) {
  const cell = value => {
    const text = String(value ?? '');
    return /[\t\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const cells = [];
  for (const column of SETTLEMENT_COLUMNS) {
    cells.push(cell(values[column.key]));
    if (column.merged) cells.push('');
  }
  return cells.join('\t');
}
