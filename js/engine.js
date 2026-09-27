import { number } from './utils.js';

function roundShared(value, mode) {
  if (mode === 'floor10') return Math.floor(value / 10) * 10;
  if (mode === 'floor1') return Math.floor(value);
  if (mode === 'round10') return Math.round(value / 10) * 10;
  if (mode === 'round1') return Math.round(value);
  return value;
}

export function projectCounts(project) {
  const total = Math.max(0, number(project.totalStudents));
  const participants = Math.max(0, number(project.actualParticipants));
  const absent = Math.max(0, number(project.absentStudents));
  const vulnerableParticipants = Math.min(participants, Math.max(0, number(project.vulnerableParticipants)));
  const vulnerableAbsent = Math.min(absent, Math.max(0, number(project.vulnerableAbsent)));
  const regularParticipants = Math.max(0, participants - vulnerableParticipants);
  const regularAbsent = Math.max(0, absent - vulnerableAbsent);
  return {
    total,
    participants,
    absent,
    participantsPlusAbsent: participants + Math.max(0, project.contractedAbsentStudents == null ? absent : number(project.contractedAbsentStudents)),
    vulnerableParticipants,
    vulnerableAbsent,
    regularParticipants,
    regularAbsent: Math.max(0, project.regularContractedAbsent == null ? regularAbsent : number(project.regularContractedAbsent)),
    contractedAbsent: Math.max(0, project.contractedAbsentStudents == null ? absent : number(project.contractedAbsentStudents)),
    vulnerableContractedAbsent: Math.max(0, project.vulnerableContractedAbsent == null ? vulnerableAbsent : number(project.vulnerableContractedAbsent)),
    regularContractedAbsent: Math.max(0, project.regularContractedAbsent == null ? regularAbsent : number(project.regularContractedAbsent)),
    fixedCostAbsent: Math.max(0, number(project.fixedCostAbsentStudents)),
    chaperones: Math.max(0, number(project.chaperones))
  };
}

export function quantityFor(expense, project) {
  const c = projectCounts(project);
  if (expense.quantityBase === 'totalStudents') return c.total;
  if (expense.quantityBase === 'participantsPlusAbsent') return c.participantsPlusAbsent;
  if (expense.quantityBase === 'fixedCostAbsent') return c.participants + c.fixedCostAbsent;
  if (expense.quantityBase === 'custom') return Math.max(0, number(expense.customQuantity));
  return c.participants;
}

export function expenseCohortQuantities(expense, project) {
  const c = projectCounts(project);
  if (expense.quantityBase === 'participantsPlusAbsent') {
    return {
      regular: c.regularParticipants,
      vulnerable: c.vulnerableParticipants,
      regularAbsent: c.regularContractedAbsent,
      vulnerableAbsent: c.vulnerableContractedAbsent,
      unclassified: 0
    };
  }
  if (expense.quantityBase === 'fixedCostAbsent') {
    return { regular: c.regularParticipants, vulnerable: c.vulnerableParticipants, regularAbsent: 0, vulnerableAbsent: 0, unclassified: c.fixedCostAbsent };
  }
  if (expense.quantityBase === 'totalStudents') {
    const known = c.participantsPlusAbsent;
    const extra = Math.max(0, c.total - known);
    return {
      regular: c.regularParticipants,
      vulnerable: c.vulnerableParticipants,
      regularAbsent: c.regularContractedAbsent,
      vulnerableAbsent: c.vulnerableContractedAbsent,
      unclassified: extra
    };
  }
  if (expense.quantityBase === 'custom') {
    const q = quantityFor(expense, project);
    const custom = expense.customCohorts;
    if (custom && Object.values(custom).reduce((sum, value) => sum + Math.max(0, number(value)), 0) === q) {
      return {
        regular: Math.max(0, number(custom.regular)),
        vulnerable: Math.max(0, number(custom.vulnerable)),
        regularAbsent: Math.max(0, number(custom.regularAbsent)),
        vulnerableAbsent: Math.max(0, number(custom.vulnerableAbsent)),
        unclassified: Math.max(0, number(custom.unclassified))
      };
    }
    return { regular: 0, vulnerable: 0, regularAbsent: 0, vulnerableAbsent: 0, unclassified: q };
  }
  return {
    regular: c.regularParticipants,
    vulnerable: c.vulnerableParticipants,
    regularAbsent: 0,
    vulnerableAbsent: 0,
    unclassified: 0
  };
}

function splitIntegerAmount(amount, quantities) {
  const keys = ['vulnerable', 'regular', 'vulnerableAbsent', 'regularAbsent', 'unclassified'];
  const normalized = Object.fromEntries(keys.map(key => [key, Math.max(0, Math.floor(number(quantities[key])))]));
  const totalQuantity = keys.reduce((sum, key) => sum + normalized[key], 0);
  const total = Math.max(0, Math.round(number(amount)));
  if (!totalQuantity) return { vulnerable: 0, regular: 0, vulnerableAbsent: 0, regularAbsent: 0, unclassified: total };
  const base = Math.floor(total / totalQuantity);
  let remainder = total - base * totalQuantity;
  const result = {};
  for (const key of keys) {
    const extra = Math.min(normalized[key], remainder);
    result[key] = base * normalized[key] + extra;
    remainder -= extra;
  }
  return result;
}

export function calculateExpense(expense, project, settlement = false) {
  const c = projectCounts(project);
  const studentQty = quantityFor(expense, project);
  const cohorts = expenseCohortQuantities(expense, project);
  let unit = 0;
  let studentTotal = 0;
  let staffTotal = 0;
  let total = 0;

  if (expense.calcMethod === 'sharedFixed') {
    const contract = Math.max(0, Math.round(number(settlement && expense.actualAmount !== null && expense.actualAmount !== '' ? expense.actualAmount : expense.planAmount)));
    const denominator = studentQty + c.chaperones;
    if (c.chaperones === 0 && studentQty > 0) {
      studentTotal = contract;
      unit = contract / studentQty;
      staffTotal = 0;
    } else if (studentQty === 0) {
      unit = 0;
      // With no attendees or guides there is no real person group to charge.
      // Preserve the contracted amount as an unclassified student-side cost
      // instead of silently dropping it or inventing a staff allocation.
      studentTotal = c.chaperones > 0 ? 0 : contract;
      staffTotal = c.chaperones > 0 ? contract : 0;
    } else {
      unit = denominator > 0 ? Math.min(
        roundShared(contract / denominator, expense.rounding ?? 'floor10'),
        Math.floor(contract / studentQty)
      ) : 0;
      studentTotal = unit * studentQty;
      staffTotal = c.chaperones > 0 ? contract - studentTotal : 0;
    }
    total = contract;
  } else if (expense.calcMethod === 'fixedStudent') {
    studentTotal = Math.max(0, Math.round(number(settlement && expense.actualAmount !== null && expense.actualAmount !== '' ? expense.actualAmount : expense.planAmount)));
    total = studentTotal;
    unit = studentQty > 0 ? studentTotal / studentQty : 0;
  } else {
    unit = Math.max(0, number(expense.unitAmount));
    studentTotal = settlement && expense.actualAmount !== null && expense.actualAmount !== ''
      ? Math.max(0, Math.round(number(expense.actualAmount)))
      : Math.max(0, Math.round(unit * studentQty));
    total = studentTotal;
    if (settlement && expense.actualAmount !== null && expense.actualAmount !== '' && studentQty > 0) unit = studentTotal / studentQty;
  }

  const cohortCosts = splitIntegerAmount(studentTotal, cohorts);

  return { ...expense, studentQty, unit, studentTotal, staffTotal, total, cohortCosts };
}

// 인솔자 전용 비용표의 계산 규칙이다. DOM과 무관한 업무 규칙이므로 뷰가 아니라 엔진에 둔다.
// 이 값은 현재 학생 재원 배분(allocateFunding)에는 자동 합산하지 않는다.
export function calculateStaffExpense(expense, project, settlement = false) {
  const chaperones = projectCounts(project).chaperones;
  const actualEntered = settlement && expense.actualAmount !== null && expense.actualAmount !== '';

  if (expense.calcMethod === 'sharedFixed') {
    return { total: calculateExpense(expense, project, settlement).staffTotal };
  }

  if (actualEntered) {
    return { total: Math.max(0, number(expense.actualAmount)) };
  }

  if (expense.calcMethod === 'fixedStudent') {
    return { total: Math.max(0, number(expense.planAmount)) };
  }

  const paidStaffCount = expense.paidStaffCount === null || expense.paidStaffCount === undefined
    ? chaperones : Math.min(chaperones, Math.max(0, Math.floor(number(expense.paidStaffCount))));
  return { total: Math.max(0, Math.round(number(expense.unitAmount) * paidStaffCount)), paidStaffCount };
}

export function calculateExpenses(project, settlement = false) {
  const rows = project.expenses.map(expense => calculateExpense(expense, project, settlement));
  return {
    rows,
    studentTotal: rows.reduce((s, row) => s + row.studentTotal, 0),
    staffTotal: rows.reduce((s, row) => s + row.staffTotal, 0),
    total: rows.reduce((s, row) => s + row.total, 0)
  };
}

function allocateEducation(rows, project) {
  const c = projectCounts(project);
  const allocations = rows.map(row => ({ id: row.id, education: 0, educationRegular: 0, educationVulnerable: 0, school: 0, student: 0 }));

  // 취약계층: 실비 전액 또는 1인당 한도. 불참 고정비가 있으면 취약 불참자 몫도 실비전액에 포함한다.
  let vulnerableBudget;
  if (project.educationSupport?.vulnerableMode === 'perPerson') {
    vulnerableBudget = number(project.educationSupport.vulnerablePerPerson) * c.vulnerableParticipants;
  } else {
    vulnerableBudget = Number.POSITIVE_INFINITY;
  }
  for (let i = 0; i < rows.length; i++) {
    const eligible = rows[i].cohortCosts.vulnerable + rows[i].cohortCosts.vulnerableAbsent;
    const amount = Math.min(eligible, vulnerableBudget);
    allocations[i].education += amount;
    allocations[i].educationVulnerable += amount;
    if (Number.isFinite(vulnerableBudget)) vulnerableBudget -= amount;
  }

  // 비취약계층: 1인당 지원액을 참가학생 수만큼 잡고 체험처 순서대로 사용한다.
  let regularBudget = number(project.educationSupport?.regularPerPerson) * c.regularParticipants;
  for (let i = 0; i < rows.length && regularBudget > 0; i++) {
    const eligible = rows[i].cohortCosts.regular;
    const amount = Math.min(eligible, regularBudget);
    allocations[i].education += amount;
    allocations[i].educationRegular += amount;
    regularBudget -= amount;
  }

  return allocations;
}

export function allocateFunding(project, settlement = false) {
  const expenses = calculateExpenses(project, settlement);
  const rows = expenses.rows;
  const allocations = allocateEducation(rows, project);
  const c = projectCounts(project);

  let schoolBudget = project.schoolSupport?.mode === 'perPersonRegular'
    ? number(project.schoolSupport.amount) * c.regularParticipants
    : number(project.schoolSupport?.amount);

  // 학교 자체지원금은 교육청 지원 후 남은 비취약 참가학생 비용에 체험처 순서대로 사용한다.
  for (let i = 0; i < rows.length && schoolBudget > 0; i++) {
    const regularCost = rows[i].cohortCosts.regular;
    const remainingRegular = Math.max(0, regularCost - allocations[i].educationRegular);
    const amount = Math.min(remainingRegular, schoolBudget);
    allocations[i].school += amount;
    schoolBudget -= amount;
  }

  // 나머지 학생경비는 학생부담으로 표시한다. 참가학생 개인부담과 불참자 등 기타 잔액을 구분해 둔다.
  for (let i = 0; i < rows.length; i++) {
    const regularParticipantResidual = Math.max(0, rows[i].cohortCosts.regular - allocations[i].educationRegular - allocations[i].school);
    const vulnerableResidual = Math.max(0, rows[i].cohortCosts.vulnerable + rows[i].cohortCosts.vulnerableAbsent - allocations[i].educationVulnerable);
    const regularAbsentResidual = Math.max(0, rows[i].cohortCosts.regularAbsent);
    allocations[i].studentRegular = regularParticipantResidual;
    allocations[i].studentOther = vulnerableResidual + regularAbsentResidual;
    allocations[i].student = allocations[i].studentRegular + allocations[i].studentOther;
  }

  const educationUsed = allocations.reduce((s, a) => s + a.education, 0);
  const schoolUsed = allocations.reduce((s, a) => s + a.school, 0);
  const studentUsed = allocations.reduce((s, a) => s + a.student, 0);
  const regularStudentUsed = allocations.reduce((s, a) => s + a.studentRegular, 0);
  const grantTotal = project.educationSupport?.grantTotal === null || project.educationSupport?.grantTotal === ''
    ? null : number(project.educationSupport.grantTotal);

  return {
    expenses,
    allocations: rows.map((row, i) => ({ ...allocations[i], name: row.name, studentTotal: row.studentTotal })),
    educationUsed,
    schoolUsed,
    studentUsed,
    educationBalance: grantTotal === null ? null : grantTotal - educationUsed,
    schoolBudget: project.schoolSupport?.mode === 'perPersonRegular'
      ? number(project.schoolSupport.amount) * c.regularParticipants
      : number(project.schoolSupport?.amount),
    schoolBalance: schoolBudget,
    regularPersonalBurden: c.regularParticipants > 0 ? regularStudentUsed / c.regularParticipants : 0
  };
}

export function validateProject(project, settlement = false) {
  const c = projectCounts(project);
  const result = allocateFunding(project, settlement);
  const issues = [];
  const enteredVulnerableParticipants = Math.max(0, number(project.vulnerableParticipants));
  const enteredVulnerableAbsent = Math.max(0, number(project.vulnerableAbsent));

  if (c.participants + c.absent !== c.total) {
    issues.push(`총학생수(${c.total})와 실제참가학생수+불참자수(${c.participants + c.absent})가 일치하지 않습니다.`);
  }
  if (enteredVulnerableParticipants > c.participants) issues.push('취약계층 참가학생수가 실제 참가학생수보다 많습니다.');
  if (enteredVulnerableAbsent > c.absent) issues.push('취약계층 불참자수가 전체 불참자수보다 많습니다.');
  if (result.educationBalance !== null && result.educationBalance < 0) {
    issues.push(`교육청 교부액보다 ${Math.abs(result.educationBalance).toLocaleString()}원을 초과하여 배분했습니다.`);
  }
  if (result.regularPersonalBurden && !Number.isInteger(result.regularPersonalBurden)) {
    issues.push(`비취약 참가학생 1인 부담액이 정수로 나누어지지 않습니다. 현재 평균 ${result.regularPersonalBurden.toFixed(2)}원입니다.`);
  }
  return { counts: c, result, issues };
}
