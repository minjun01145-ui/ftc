import { number } from './utils.js';

export const COHORTS = ['regular', 'vulnerable', 'absentRegular', 'absentVulnerable'];

export function participantCounts(project) {
  const p = project.participants;
  const actualStudents = number(p.regular) + number(p.vulnerable);
  const absentFixed = number(p.absentRegular) + number(p.absentVulnerable);
  return {
    actualStudents,
    absentFixed,
    fixedStudents: actualStudents + absentFixed,
    chaperones: number(p.chaperones),
    regular: number(p.regular),
    vulnerable: number(p.vulnerable),
    absentRegular: number(p.absentRegular),
    absentVulnerable: number(p.absentVulnerable)
  };
}

function roundShared(value, mode) {
  if (mode === 'floor10') return Math.floor(value / 10) * 10;
  if (mode === 'floor1') return Math.floor(value);
  if (mode === 'round10') return Math.round(value / 10) * 10;
  if (mode === 'round1') return Math.round(value);
  return value;
}

function scopeCohorts(scope, counts) {
  if (scope === 'fixedStudents') {
    return {
      regular: counts.regular,
      vulnerable: counts.vulnerable,
      absentRegular: counts.absentRegular,
      absentVulnerable: counts.absentVulnerable
    };
  }
  return {
    regular: counts.regular,
    vulnerable: counts.vulnerable,
    absentRegular: 0,
    absentVulnerable: 0
  };
}

export function calculateExpense(expense, project, settlement = false) {
  const counts = participantCounts(project);
  const scope = scopeCohorts(expense.scope, counts);
  const studentQty = Object.values(scope).reduce((a, b) => a + b, 0);
  let studentTotal = 0;
  let staffTotal = 0;
  let unit = 0;
  let contractTotal = 0;
  let cohortCosts = Object.fromEntries(COHORTS.map(c => [c, 0]));

  if (expense.calcMode === 'sharedFixed') {
    contractTotal = number(settlement && expense.actualContractTotal !== null && expense.actualContractTotal !== ''
      ? expense.actualContractTotal : expense.contractTotal);
    const denominator = studentQty + counts.chaperones;
    unit = denominator > 0 ? roundShared(contractTotal / denominator, expense.rounding) : 0;
    for (const cohort of COHORTS) cohortCosts[cohort] = scope[cohort] * unit;
    studentTotal = Object.values(cohortCosts).reduce((a, b) => a + b, 0);
    staffTotal = contractTotal - studentTotal;
  } else if (expense.calcMode === 'staffPerPerson') {
    unit = number(settlement && expense.actualUnitAmount !== null && expense.actualUnitAmount !== ''
      ? expense.actualUnitAmount : expense.unitAmount);
    staffTotal = unit * counts.chaperones;
    contractTotal = staffTotal;
  } else if (expense.calcMode === 'staffFixed') {
    contractTotal = number(settlement && expense.actualContractTotal !== null && expense.actualContractTotal !== ''
      ? expense.actualContractTotal : expense.contractTotal);
    staffTotal = contractTotal;
  } else {
    unit = number(settlement && expense.actualUnitAmount !== null && expense.actualUnitAmount !== ''
      ? expense.actualUnitAmount : expense.unitAmount);
    for (const cohort of COHORTS) cohortCosts[cohort] = scope[cohort] * unit;
    studentTotal = Object.values(cohortCosts).reduce((a, b) => a + b, 0);
    contractTotal = studentTotal;
  }

  return { ...expense, unit, studentQty, studentTotal, staffTotal, contractTotal, cohortCosts };
}

export function calculateExpenses(project, settlement = false) {
  const rows = project.expenses.map(exp => calculateExpense(exp, project, settlement));
  return {
    rows,
    studentTotal: rows.reduce((sum, r) => sum + r.studentTotal, 0),
    staffTotal: rows.reduce((sum, r) => sum + r.staffTotal, 0),
    projectTotal: rows.reduce((sum, r) => sum + r.studentTotal + r.staffTotal, 0)
  };
}

function ruleNominalBudget(rule, project, expenseMap) {
  const counts = participantCounts(project);
  const targetCount = rule.targetCohorts.reduce((sum, cohort) => sum + number(counts[cohort]), 0);
  if (rule.kind === 'perCapita') return number(rule.unitAmount) * targetCount;
  if (rule.kind === 'fixed') return number(rule.unitAmount);
  if (rule.kind === 'residual') return Number.POSITIVE_INFINITY;
  if (rule.kind === 'fullCost') {
    let total = 0;
    for (const expenseId of rule.eligibleExpenseIds) {
      const exp = expenseMap.get(expenseId);
      if (!exp) continue;
      for (const cohort of rule.targetCohorts) total += number(exp.cohortCosts[cohort]);
    }
    return total;
  }
  return 0;
}

export function allocateFunding(project, settlement = false) {
  const expensesResult = calculateExpenses(project, settlement);
  const expenseMap = new Map(expensesResult.rows.map(r => [r.id, r]));
  const remaining = new Map();
  for (const exp of expensesResult.rows) {
    remaining.set(exp.id, Object.fromEntries(COHORTS.map(c => [c, number(exp.cohortCosts[c])] )));
  }

  const allocations = [];
  const rules = project.fundingRules.map((rule, index) => ({ ...rule, _order: index }));

  for (const rule of rules) {
    let budget = ruleNominalBudget(rule, project, expenseMap);
    const nominalBudget = budget;
    let used = 0;
    const lines = [];

    for (const expenseId of rule.eligibleExpenseIds) {
      if (budget <= 0) break;
      const exp = expenseMap.get(expenseId);
      if (!exp) continue;
      const rem = remaining.get(expenseId);
      for (const cohort of rule.targetCohorts) {
        if (budget <= 0) break;
        const available = number(rem[cohort]);
        if (available <= 0) continue;
        const amount = rule.kind === 'residual' ? available : Math.min(available, budget);
        if (amount <= 0) continue;
        rem[cohort] -= amount;
        if (rule.kind !== 'residual') budget -= amount;
        used += amount;
        lines.push({ expenseId, expenseName: exp.name, cohort, amount });
      }
    }

    allocations.push({
      rule,
      nominalBudget: Number.isFinite(nominalBudget) ? nominalBudget : used,
      used,
      unusedRuleBudget: Number.isFinite(nominalBudget) ? Math.max(0, nominalBudget - used) : 0,
      lines
    });
  }

  const accountResults = project.fundAccounts.map(account => {
    const related = allocations.filter(a => a.rule.accountId === account.id);
    const used = related.reduce((sum, a) => sum + a.used, 0);
    const budgetAmount = account.budgetAmount === null || account.budgetAmount === '' ? null : number(account.budgetAmount);
    return {
      ...account,
      used,
      balance: budgetAmount === null ? null : budgetAmount - used,
      rules: related
    };
  });

  let uncovered = 0;
  const uncoveredLines = [];
  for (const [expenseId, cohorts] of remaining.entries()) {
    const exp = expenseMap.get(expenseId);
    for (const cohort of COHORTS) {
      const amount = number(cohorts[cohort]);
      if (amount > 0) {
        uncovered += amount;
        uncoveredLines.push({ expenseId, expenseName: exp?.name ?? expenseId, cohort, amount });
      }
    }
  }

  return { expensesResult, allocations, accountResults, uncovered, uncoveredLines };
}

export function validateProject(project, settlement = false) {
  const issues = [];
  const counts = participantCounts(project);
  const allocation = allocateFunding(project, settlement);

  if (counts.actualStudents <= 0) issues.push({ level: 'error', message: '실제 참가학생 수가 0명입니다.' });
  if (Object.values(project.participants).some(v => number(v) < 0)) issues.push({ level: 'error', message: '인원 수에는 음수를 입력할 수 없습니다.' });

  for (const account of allocation.accountResults) {
    if (account.balance !== null && account.balance < 0) {
      issues.push({ level: 'error', message: `${account.name} 집행액이 입력한 교부/예산액을 ${Math.abs(account.balance).toLocaleString()}원 초과합니다.` });
    }
  }

  for (const a of allocation.allocations) {
    if (a.rule.kind !== 'residual' && a.unusedRuleBudget > 0 && a.used > 0) {
      issues.push({ level: 'info', message: `${a.rule.name}: 규칙상 사용 가능액 중 ${a.unusedRuleBudget.toLocaleString()}원이 사용되지 않았습니다.` });
    }
  }

  if (allocation.uncovered > 0) {
    issues.push({ level: 'error', message: `재원이 배정되지 않은 학생 경비가 ${allocation.uncovered.toLocaleString()}원 있습니다.` });
  }

  const studentAccount = allocation.accountResults.find(a => a.type === 'student');
  if (studentAccount && counts.regular > 0) {
    const burden = studentAccount.used / counts.regular;
    if (!Number.isInteger(burden)) {
      issues.push({ level: 'warning', message: `비취약 참가학생 1인 부담액이 정수로 나누어지지 않습니다. 현재 평균 ${burden.toFixed(2)}원입니다.` });
    }
  }

  if (issues.length === 0) issues.push({ level: 'ok', message: '현재 입력값에서 발견된 계산 불일치가 없습니다.' });
  return { counts, allocation, issues };
}

export function summarize(project, settlement = false) {
  const validation = validateProject(project, settlement);
  const studentAccount = validation.allocation.accountResults.find(a => a.type === 'student');
  const regular = validation.counts.regular;
  return {
    ...validation,
    personalBurden: studentAccount && regular > 0 ? studentAccount.used / regular : 0
  };
}
