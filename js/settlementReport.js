import { projectCounts } from './engine.js';
import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, VULNERABLE_BUDGET_ID, buildProposal } from './proposalPlanner.js';
import { number } from './utils.js';

/**
 * 교육청 '(초6·중2·고2) 현장체험학습비 지원금 정산 서식'을 채울 때 참고할 값.
 * 품의 도우미의 예산 배정 결과를 쓰므로, 시행 후 인원·비용을 실제대로 고친 뒤 확인한다.
 */
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
    const names = [...new Set(proposal.absent.map(item => item.name))];
    // 누가 냈는지: 교육청 지원금(불참 학생 몫)과 학생 부담
    const absentTotalOf = ids => proposal.blocks
      .filter(block => ids.includes(block.budget.id))
      .reduce((sum, block) => sum + block.absentTotal, 0);
    const paid = [
      ['교육청 지원금', absentTotalOf([VULNERABLE_BUDGET_ID, EDUCATION_BUDGET_ID])],
      ['학생 부담', absentTotalOf([STUDENT_BUDGET_ID])]
    ].filter(([, amount]) => amount > 0);
    const funding = paid.length ? ` (${paid.map(([name, amount]) => `${name} ${won(amount)}`).join(', ')})` : '';
    remarks.push(`신청 후 불참자 ${proposal.counts.dayAbsent}명 공통경비(${names.join(', ')}): ${won(proposal.dayAbsentTotal)}${funding}`);
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
    dayAbsentCount: proposal.counts.dayAbsent,
    dayAbsentCommonCost: proposal.dayAbsentTotal,
    remarks: remarks.join('\n')
  };

  const warnings = [];
  if (proposal.unassignedTotal > 0) warnings.push(`품의 도우미에서 아직 배정하지 않은 금액 ${won(proposal.unassignedTotal)}이 있어 부담액이 정확하지 않습니다.`);
  if (grantTotal === null) warnings.push('예산 관리에서 교육청 지원금 교부액을 입력하면 잔액이 계산됩니다.');
  if (grantTotal !== null && values.balance < 0) warnings.push('집행액이 교부액보다 많습니다.');
  if (!values.schoolName) warnings.push('사업정보에서 학교명을 입력해 주세요.');
  if (!values.period) warnings.push('사업정보에서 시작일·종료일을 입력해 주세요.');
  if (values.grade === '') warnings.push('인원에서 대상 학년을 선택해 주세요.');

  return { values, warnings };
}
