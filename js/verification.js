import { projectCounts } from './engine.js';
import { checkStudentExpenses } from './expenseChecks.js';
import { activeFixedCosts, fixedCostBreakdown } from './fixedCosts.js';
import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, VULNERABLE_BUDGET_ID, buildProposal } from './proposalPlanner.js';
import { number } from './utils.js';
import { summarizeAttendance } from './workflowEngine.js';

/**
 * 검증 도우미. 입력한 값이 서로 맞는지 여러 방법으로 다시 계산해 본다.
 * 저장을 막지 않고 결과만 보여 준다.
 *
 * check = {
 *   id, title,
 *   status: 'ok' | 'warn' | 'fail' | 'skip',
 *   lines: ['계산식 한 줄', ...],   // 사람이 손으로 따라 계산할 수 있게
 *   result: '결론 한 줄',
 *   items: ['확인할 것', ...]       // 선택
 * }
 */
const won = value => `${Math.round(number(value)).toLocaleString('ko-KR')}원`;
const sum = (items, pick) => items.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
const same = (left, right) => Math.round(left) === Math.round(right);

function blockOf(proposal, id) {
  return proposal.blocks.find(block => block.budget.id === id);
}

function otherBlocks(proposal) {
  return proposal.blocks.filter(block => ![VULNERABLE_BUDGET_ID, EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID].includes(block.budget.id));
}

const absentGroupName = group => (group === 'vulnerable' ? '취약계층' : '비취약계층');

/* 1. 인원: 학년 학생수 = 신청 + 미신청, 신청 = 참여 + 신청 후 불참, 참여 = 취약 + 비취약 */
function headcountCheck(project) {
  const summary = summarizeAttendance(project.workflow?.attendance ?? {}, project.totalStudents);
  const c = projectCounts(project);
  const absent = summary.regularAbsent + summary.vulnerableAbsent;
  const applicants = summary.participants + absent;
  const notApplied = summary.enrolled - applicants;
  const lines = [
    `해당 학년 학생수 ${summary.enrolled}명 = 신청 ${applicants}명 + 미신청 ${notApplied}명`,
    `신청 ${applicants}명 = 실제 참여 ${summary.participants}명 + 신청 후 불참 ${absent}명(비취약 ${summary.regularAbsent}, 취약 ${summary.vulnerableAbsent})`,
    `실제 참여 ${summary.participants}명 = 비취약계층 ${summary.regularParticipants}명 + 취약계층 ${summary.vulnerableParticipants}명`
  ];
  const items = [...summary.issues];
  if (summary.enrolled <= 0) items.push('인원 화면에서 대상 학년을 선택하고 기본정보에 학년별 학생수를 입력해 주세요.');
  if (notApplied < 0) items.push('신청 인원이 해당 학년 학생수보다 많습니다.');
  if (summary.participants !== c.participants || summary.vulnerableParticipants !== c.vulnerableParticipants
      || absent !== c.contractedAbsent) {
    items.push(`인원 화면의 값(참여 ${summary.participants}명, 취약계층 ${summary.vulnerableParticipants}명)과 계산에 쓰는 값(참여 ${c.participants}명, 취약계층 ${c.vulnerableParticipants}명)이 다릅니다. 인원 화면에서 저장해 주세요.`);
  }
  if (c.chaperones <= 0) items.push('인솔자 수가 0명입니다. 버스비 등 인솔자와 나누는 비용이 있으면 확인해 주세요.');
  const fail = summary.issues.length || notApplied < 0 || summary.enrolled <= 0
    || summary.participants !== c.participants || summary.vulnerableParticipants !== c.vulnerableParticipants;
  return {
    id: 'headcount',
    title: '인원이 서로 맞는가',
    status: fail ? 'fail' : (items.length ? 'warn' : 'ok'),
    lines,
    result: fail ? '인원 입력을 확인해 주세요.' : '인원 구성이 서로 맞습니다.',
    items
  };
}

/* 2. 학생 1인당 금액 × 참여 인원 + 신청 후 불참 공통비 = 학생 경비 총액 = 예산별 품의 총액 */
function perPersonTotalCheck(proposal) {
  const participants = proposal.counts.regular + proposal.counts.vulnerable;
  const participantCost = proposal.perPersonTotal * participants;
  const lines = [`학생 1인당 금액 ${won(proposal.perPersonTotal)} × 참여 ${participants}명 = ${won(participantCost)}`];
  let absentCost = 0;
  for (const group of ['regular', 'vulnerable']) {
    const items = proposal.absent.filter(line => line.group === group);
    if (!items.length) continue;
    const perPerson = sum(items, line => line.perPerson);
    const total = sum(items, line => line.total);
    absentCost += total;
    lines.push(`+ 신청 후 불참(${absentGroupName(group)}) 공통비 ${won(perPerson)} × ${items[0].count}명 = ${won(total)}`);
  }
  const expected = participantCost + absentCost;
  lines.push(`= ${won(expected)}`);
  lines.push(`학생 1인별 금액 산출내역의 총액: ${won(proposal.costTotal)}`);
  const planned = proposal.assignedTotal + proposal.unassignedTotal;
  lines.push(`예산별 품의 내용 총액(배정 ${won(proposal.assignedTotal)} + 미배정 ${won(proposal.unassignedTotal)}): ${won(planned)}`);

  const items = [];
  if (!same(expected, proposal.costTotal)) {
    items.push(`1인당 금액으로 계산한 값과 산출내역 총액이 ${won(Math.abs(expected - proposal.costTotal))} 다릅니다. '학생 총액(신청 후 불참 포함)' 항목이 있는데 인원 화면의 '신청 후 불참자 공통비 부담'이 꺼져 있거나, 인원을 직접 입력한 항목이 있는지 확인해 주세요.`);
  }
  if (!same(planned, proposal.costTotal)) {
    items.push(`예산별 품의 총액이 산출내역 총액과 ${won(Math.abs(planned - proposal.costTotal))} 다릅니다.`);
  }
  return {
    id: 'per-person-total',
    title: '학생 1인당 금액 × 인원 = 전체 경비',
    status: items.length ? 'fail' : 'ok',
    lines,
    result: items.length ? '금액이 맞지 않습니다.' : `세 방법 모두 ${won(expected)}으로 같습니다.`,
    items
  };
}

/* 3. 계층별 경비 = 계층별 품의액 (취약 + 비취약 + 신청 후 불참 = 전체 예산액) */
function cohortCheck(proposal) {
  const vulnerable = blockOf(proposal, VULNERABLE_BUDGET_ID);
  const education = blockOf(proposal, EDUCATION_BUDGET_ID);
  const student = blockOf(proposal, STUDENT_BUDGET_ID);
  const others = otherBlocks(proposal);
  const { counts } = proposal;
  const lines = [];
  const items = [];

  // 취약계층 참여
  const vulnerableCost = proposal.perPersonTotal * counts.vulnerable;
  const vulnerablePaid = vulnerable.participantTotal + proposal.vulnerableBurden.total;
  if (counts.vulnerable > 0) {
    lines.push(`취약계층 ${counts.vulnerable}명 경비 ${won(vulnerableCost)} = 교육청(취약) ${won(vulnerable.participantTotal)} + 학생 부담 ${won(proposal.vulnerableBurden.total)} = ${won(vulnerablePaid)}`);
    if (!same(vulnerableCost, vulnerablePaid)) items.push(`취약계층 경비와 품의액이 ${won(Math.abs(vulnerableCost - vulnerablePaid))} 다릅니다.`);
  }

  // 비취약계층 참여
  const regularCost = proposal.perPersonTotal * counts.regular;
  const regularUnassigned = proposal.regularUnassignedPerPerson * counts.regular;
  const regularParts = [
    ['교육청(비취약)', education.participantTotal],
    ...others.map(block => [block.budget.name.replace(/^기타 지원금\((.*)\)$/, '$1'), block.participantTotal]),
    ['수익자 부담', student.participantTotal],
    ...(regularUnassigned > 0 ? [['미배정', regularUnassigned]] : [])
  ];
  const regularPaid = sum(regularParts, ([, amount]) => amount);
  lines.push(`비취약계층 ${counts.regular}명 경비 ${won(regularCost)} = ${regularParts.map(([name, amount]) => `${name} ${won(amount)}`).join(' + ')} = ${won(regularPaid)}`);
  if (!same(regularCost, regularPaid)) items.push(`비취약계층 경비와 품의액이 ${won(Math.abs(regularCost - regularPaid))} 다릅니다.`);

  // 신청 후 불참
  const absentCost = sum(proposal.absent, line => line.total);
  if (absentCost > 0) {
    const absentUnassigned = sum(proposal.unassigned.absent, line => line.total);
    const absentParts = [
      ['교육청', vulnerable.absentTotal + education.absentTotal],
      ['수익자 부담', student.absentTotal],
      ...(absentUnassigned > 0 ? [['미배정', absentUnassigned]] : [])
    ];
    const absentPaid = sum(absentParts, ([, amount]) => amount);
    lines.push(`신청 후 불참 ${counts.dayAbsent}명 공통비 ${won(absentCost)} = ${absentParts.map(([name, amount]) => `${name} ${won(amount)}`).join(' + ')} = ${won(absentPaid)}`);
    if (!same(absentCost, absentPaid)) items.push(`신청 후 불참 공통비와 품의액이 ${won(Math.abs(absentCost - absentPaid))} 다릅니다.`);
  }

  const totalCost = vulnerableCost + regularCost + absentCost;
  lines.push(`합계 ${won(vulnerableCost)} + ${won(regularCost)} + ${won(absentCost)} = ${won(totalCost)} (전체 예산액 ${won(proposal.assignedTotal + proposal.unassignedTotal)})`);
  if (!same(totalCost, proposal.assignedTotal + proposal.unassignedTotal)) items.push('계층별 경비의 합이 전체 예산액과 다릅니다.');

  const unassigned = proposal.unassignedTotal > 0;
  return {
    id: 'cohorts',
    title: '취약 + 비취약 + 신청 후 불참 = 전체 예산액',
    status: items.length ? 'fail' : (unassigned ? 'warn' : 'ok'),
    lines,
    result: items.length
      ? '계층별 금액이 맞지 않습니다.'
      : (unassigned ? `금액은 맞지만 아직 배정하지 않은 금액 ${won(proposal.unassignedTotal)}이 있습니다.` : '계층별 경비와 예산별 품의액이 모두 같습니다.'),
    items
  };
}

/* 4. 학생 1인당 금액 = 예산별 1인당 금액의 합 */
function perPersonSplitCheck(proposal) {
  const vulnerable = blockOf(proposal, VULNERABLE_BUDGET_ID);
  const education = blockOf(proposal, EDUCATION_BUDGET_ID);
  const student = blockOf(proposal, STUDENT_BUDGET_ID);
  const others = otherBlocks(proposal).filter(block => block.usedPerPerson > 0);
  const lines = [];
  const items = [];

  const regularParts = [
    ['교육청', education.usedPerPerson],
    ...others.map(block => [block.budget.name.replace(/^기타 지원금\((.*)\)$/, '$1'), block.usedPerPerson]),
    ['수익자 부담', student.usedPerPerson],
    ...(proposal.regularUnassignedPerPerson > 0 ? [['미배정', proposal.regularUnassignedPerPerson]] : [])
  ];
  const regularSum = sum(regularParts, ([, amount]) => amount);
  lines.push(`비취약계층 1인: ${regularParts.map(([name, amount]) => `${name} ${won(amount)}`).join(' + ')} = ${won(regularSum)} (1인당 금액 ${won(proposal.perPersonTotal)})`);
  if (!same(regularSum, proposal.perPersonTotal)) items.push('비취약계층 1인 금액이 예산별 1인 금액의 합과 다릅니다.');

  if (proposal.counts.vulnerable > 0) {
    const vulnerableSum = vulnerable.usedPerPerson + proposal.vulnerableBurden.perPerson;
    lines.push(`취약계층 1인: 교육청 ${won(vulnerable.usedPerPerson)} + 학생 부담 ${won(proposal.vulnerableBurden.perPerson)} = ${won(vulnerableSum)} (1인당 금액 ${won(proposal.perPersonTotal)})`);
    if (!same(vulnerableSum, proposal.perPersonTotal)) items.push('취약계층 1인 금액이 예산별 1인 금액의 합과 다릅니다.');
  }

  if (student.usedPerPerson > 0 && student.usedPerPerson % 10 !== 0) {
    items.push(`비취약계층 학생 1인 부담액 ${won(student.usedPerPerson)}이 10원 단위가 아닙니다. 걷을 금액이 맞는지 확인해 주세요.`);
  }
  const fail = items.some(item => item.includes('다릅니다'));
  return {
    id: 'per-person-split',
    title: '학생 1인당 금액 = 예산별 1인당 금액의 합',
    status: fail ? 'fail' : (items.length ? 'warn' : 'ok'),
    lines,
    result: fail ? '1인당 금액이 맞지 않습니다.' : `학생 1인당 ${won(proposal.perPersonTotal)}이 예산별로 빠짐없이 나뉘었습니다.`,
    items
  };
}

/* 5. 교육청 지원금: 한도와 교부액 */
function educationCheck(proposal) {
  const vulnerable = blockOf(proposal, VULNERABLE_BUDGET_ID);
  const education = blockOf(proposal, EDUCATION_BUDGET_ID);
  const lines = [];
  const items = [];

  for (const block of [vulnerable, education]) {
    const people = block.budget.count + block.absentCount;
    if (people <= 0) continue;
    const absentText = block.absentCount > 0 ? `(참여 ${block.budget.count} + 신청 후 불참 ${block.absentCount})` : '';
    if (block.budgetTotal === null) {
      lines.push(`${block.budget.name}: 실비 전액 지원 ${people}명${absentText} → 사용 ${won(block.total)}`);
      continue;
    }
    lines.push(`${block.budget.name}: 한도 1인당 ${won(block.budget.capPerPerson)} × ${people}명${absentText} = ${won(block.budgetTotal)} → 사용 ${won(block.total)}, 남음 ${won(block.budgetTotal - block.total)}`);
    if (block.total > block.budgetTotal) items.push(`${block.budget.name}이 한도보다 ${won(block.total - block.budgetTotal)} 많습니다.`);
  }

  const { grantTotal, total, balance } = proposal.education;
  if (grantTotal === null) {
    lines.push(`교육청 지원금 사용 합계 ${won(total)} (교부액 미입력)`);
    items.push('예산 관리에서 교육청 지원금 교부액을 입력하면 잔액을 확인할 수 있습니다.');
  } else {
    lines.push(`교부액 ${won(grantTotal)} − 사용 ${won(total)} = 잔액 ${won(balance)}`);
    if (balance < 0) items.push(`교부액보다 ${won(-balance)} 많이 사용했습니다.`);
    else if (balance > 0) items.push(`잔액 ${won(balance)}은 반납 대상입니다. 배정을 빠뜨린 항목이 없는지 확인해 주세요.`);
  }
  const fail = items.some(item => item.includes('많'));
  return {
    id: 'education',
    title: '교육청 지원금이 한도·교부액 안인가',
    status: fail ? 'fail' : (items.length ? 'warn' : 'ok'),
    lines,
    result: fail ? '교육청 지원금이 한도나 교부액을 넘었습니다.' : '교육청 지원금이 한도와 교부액 안에서 쓰였습니다.',
    items
  };
}

/* 6. 기타 지원금: 받은 금액 안에서 썼는가 */
function otherSupportCheck(project, proposal) {
  const blocks = otherBlocks(proposal);
  if (!blocks.length) {
    return { id: 'other-supports', title: '기타 지원금이 받은 금액 안인가', status: 'skip', lines: ['기타 지원금이 없습니다.'], result: '확인할 것이 없습니다.', items: [] };
  }
  const lines = [];
  const items = [];
  for (const block of blocks) {
    const support = (project.otherSupports ?? []).find(item => item.id === block.budget.id);
    const limit = support?.mode === 'total'
      ? number(support.amount)
      : number(support?.amount) * block.budget.count;
    const basis = support?.mode === 'total' ? `총액 ${won(limit)}` : `1인당 ${won(support?.amount)} × ${block.budget.count}명 = ${won(limit)}`;
    lines.push(`${block.budget.name}: ${basis} → 사용 ${won(block.total)}, 남음 ${won(limit - block.total)}`);
    if (block.total > limit) items.push(`${block.budget.name}을(를) 받은 금액보다 ${won(block.total - limit)} 많이 썼습니다.`);
    else if (limit - block.total > 0 && block.total > 0) items.push(`${block.budget.name} ${won(limit - block.total)}이 남습니다.`);
    else if (block.total === 0 && limit > 0) items.push(`${block.budget.name}을(를) 아직 쓰지 않았습니다.`);
  }
  const fail = items.some(item => item.includes('많이'));
  return {
    id: 'other-supports',
    title: '기타 지원금이 받은 금액 안인가',
    status: fail ? 'fail' : (items.length ? 'warn' : 'ok'),
    lines,
    result: fail ? '받은 금액보다 많이 썼습니다.' : '받은 금액 안에서 썼습니다.',
    items
  };
}

/* 7. 기타비 계약액 = 학생 몫 + 인솔자 몫 + 다른 학년 몫 + 버림 잔액 */
function fixedCostCheck(project) {
  const c = projectCounts(project);
  const counts = { participants: c.participants, dayAbsent: c.contractedAbsent, chaperones: c.chaperones };
  const options = { dayAbsentSharesCommonCost: Boolean(project.dayAbsentSharesCommonCost) };
  const entries = activeFixedCosts(project.fixedCosts).filter(entry => entry.amount > 0 && entry.mode === 'total');
  if (!entries.length) {
    return { id: 'fixed-costs', title: '기타비 계약액이 빠짐없이 나뉘었는가', status: 'skip', lines: ['전체 계약액으로 입력한 기타비가 없습니다.'], result: '확인할 것이 없습니다.', items: [] };
  }
  const lines = [];
  const items = [];
  for (const entry of entries) {
    const b = fixedCostBreakdown(entry, counts, options);
    const parts = [`학생 ${b.students}명 × ${won(b.perPerson)} = ${won(b.studentTotal)}`];
    if (b.chaperoneTotal > 0) parts.push(`인솔자 ${b.chaperones}명 ${won(b.chaperoneTotal)}`);
    if (b.otherTotal > 0) parts.push(`다른 학년 ${b.otherPeople}명 ${won(b.otherTotal)}`);
    if (b.remainder > 0) parts.push(`버림 잔액 ${won(b.remainder)}`);
    const split = b.studentTotal + b.chaperoneTotal + b.otherTotal + b.remainder;
    lines.push(`${entry.label || '기타비'} ${won(entry.amount)} = ${parts.join(' + ')} = ${won(split)}`);
    if (!same(split, entry.amount)) items.push(`${entry.label} 계약액과 나눈 금액의 합이 ${won(Math.abs(split - entry.amount))} 다릅니다.`);
    if (b.remainder >= b.divisor * 10 && b.divisor > 0) items.push(`${entry.label} 버림 잔액 ${won(b.remainder)}이 큽니다. 계산 인원을 확인해 주세요.`);
  }
  const fail = items.some(item => item.includes('다릅니다'));
  return {
    id: 'fixed-costs',
    title: '기타비 계약액이 빠짐없이 나뉘었는가',
    status: fail ? 'fail' : (items.length ? 'warn' : 'ok'),
    lines,
    result: fail ? '계약액이 맞지 않습니다.' : '계약액이 학생·인솔자·다른 학년 몫으로 빠짐없이 나뉘었습니다.',
    items
  };
}

/* 8. 배정하지 않은 금액 */
function unassignedCheck(proposal) {
  const lines = [];
  for (const line of proposal.unassigned.regular) lines.push(`비취약계층 ${line.name} 1인 ${won(line.perPerson)}`);
  for (const line of proposal.unassigned.absent) lines.push(`${line.name}(신청 후 불참 ${line.count}명) 1인 ${won(line.perPerson)} = ${won(line.total)}`);
  return {
    id: 'unassigned',
    title: '품의 도우미에서 모든 금액을 배정했는가',
    status: proposal.unassignedTotal > 0 ? 'warn' : 'ok',
    lines: lines.length ? lines : ['배정하지 않은 항목이 없습니다.'],
    result: proposal.unassignedTotal > 0 ? `아직 배정하지 않은 금액이 ${won(proposal.unassignedTotal)} 있습니다.` : '모든 금액을 배정했습니다.',
    items: []
  };
}

/* 9. 체험처/비용 기초자료 점검 */
function inputCheck(project) {
  const issues = checkStudentExpenses(project);
  return {
    id: 'inputs',
    title: '체험처/비용 입력에 빠진 것이 없는가',
    status: issues.length ? 'warn' : 'ok',
    lines: issues.length ? [] : ['단가·식사·날짜·기타비를 점검했습니다.'],
    result: issues.length ? `확인할 항목이 ${issues.length}개 있습니다.` : '확인할 항목이 없습니다.',
    items: issues
  };
}

export function buildVerification(project) {
  const proposal = buildProposal(project);
  const checks = [
    headcountCheck(project),
    perPersonTotalCheck(proposal),
    cohortCheck(proposal),
    perPersonSplitCheck(proposal),
    educationCheck(proposal),
    otherSupportCheck(project, proposal),
    fixedCostCheck(project),
    unassignedCheck(proposal),
    inputCheck(project)
  ];
  const count = status => checks.filter(check => check.status === status).length;
  return { checks, summary: { ok: count('ok'), warn: count('warn'), fail: count('fail'), skip: count('skip') } };
}
