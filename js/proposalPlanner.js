import { otherSupportPerPerson } from './budget.js';
import { studentCostLines, sumLines } from './costLines.js';
import { projectCounts } from './engine.js';
import { normalizeProposalPlan } from './proposalPlan.js';
import { number } from './utils.js';

/**
 * 품의 도우미 계산.
 *
 * 예산 카드(교육청 취약/비취약, 기타 지원금, 수익자 부담)마다 사용자가 비용 항목을 체크해 넣는다.
 * 체크한 순서대로 채우며, 예산의 1인당 한도를 넘으면 한도만큼만 넣고 나머지는 남겨 둔다.
 *   예) 교육청(비취약) 남은 한도 13,500원에 롯데월드 자유이용권 30,000원을 넣으면
 *       13,500원만 들어가고 16,500원이 남아 다른 예산에서 체크할 수 있다.
 *
 * 취약계층과 비취약계층은 학생 수가 다르므로 비용을 따로 센다(같은 항목이라도 각자 1인당 금액을 가진다).
 * 당일 불참 학생의 공통비용(버스비·숙소비 등)은 교육청 지원금(비취약계층)에서 자동으로 품의한다.
 * 취약계층에게 배정하지 않고 남은 금액은 수익자 부담으로 자동 처리한다.
 */
export const VULNERABLE_BUDGET_ID = 'education-vulnerable';
export const EDUCATION_BUDGET_ID = 'education';
export const STUDENT_BUDGET_ID = 'student';

/**
 * 예산 카드 목록. setting은 품의 도우미에서 바로 고칠 수 있는 지원 금액이다.
 *   { mode: 'perPerson' | 'total' | 'full', amount }  (full = 실비 전액, 금액 입력 없음)
 */
export function proposalBudgets(project, counts) {
  const education = project.educationSupport ?? {};
  const memos = education.memos ?? {};
  const vulnerableFull = education.vulnerableMode !== 'perPerson';
  return [
    {
      id: VULNERABLE_BUDGET_ID,
      name: '교육청 지원금(취약계층)',
      group: 'vulnerable',
      count: counts.vulnerable,
      memo: String(memos.vulnerable ?? ''),
      setting: { mode: vulnerableFull ? 'full' : 'perPerson', amount: Math.max(0, number(education.vulnerablePerPerson)) },
      capPerPerson: vulnerableFull ? Number.POSITIVE_INFINITY : Math.max(0, number(education.vulnerablePerPerson))
    },
    {
      id: EDUCATION_BUDGET_ID,
      name: '교육청 지원금(비취약계층)',
      group: 'regular',
      count: counts.regular,
      memo: String(memos.regular ?? ''),
      setting: { mode: 'perPerson', amount: Math.max(0, number(education.regularPerPerson)) },
      capPerPerson: Math.max(0, number(education.regularPerPerson))
    },
    ...(project.otherSupports ?? []).map(support => ({
      id: support.id,
      name: `기타 지원금(${support.name || '이름 없음'})`,
      group: 'regular',
      count: counts.regular,
      memo: String(support.memo ?? ''),
      source: support.source ?? 'school',
      setting: { mode: support.mode === 'total' ? 'total' : 'perPerson', amount: Math.max(0, number(support.amount)) },
      capPerPerson: otherSupportPerPerson(support, counts.regular)
    })),
    { id: STUDENT_BUDGET_ID, name: '수익자 부담', group: 'regular', count: counts.regular, memo: '', setting: null, capPerPerson: Number.POSITIVE_INFINITY }
  ];
}

/** 품의 도우미에서 고친 지원 금액을 사업 데이터에 반영한다(예산 관리와 같은 값). */
export function withBudgetAmount(project, budgetId, amount) {
  const value = Math.max(0, Math.round(number(amount)));
  if (budgetId === EDUCATION_BUDGET_ID) {
    return { ...project, educationSupport: { ...project.educationSupport, regularPerPerson: value } };
  }
  if (budgetId === VULNERABLE_BUDGET_ID) {
    return { ...project, educationSupport: { ...project.educationSupport, vulnerablePerPerson: value } };
  }
  return {
    ...project,
    otherSupports: (project.otherSupports ?? []).map(support => (support.id === budgetId ? { ...support, amount: value } : support))
  };
}

/** 체크한 순서대로 예산을 채운다. */
function replay(budgets, lines, allocations) {
  const budgetById = new Map(budgets.map(budget => [budget.id, budget]));
  const lineById = new Map(lines.map(line => [line.id, line]));
  const remaining = {
    vulnerable: new Map(lines.map(line => [line.id, line.perPerson])),
    regular: new Map(lines.map(line => [line.id, line.perPerson]))
  };
  const used = new Map(budgets.map(budget => [budget.id, 0]));

  const results = allocations
    .filter(item => budgetById.has(item.budgetId) && lineById.has(item.lineId))
    .map(item => {
      const budget = budgetById.get(item.budgetId);
      const line = lineById.get(item.lineId);
      const pool = remaining[budget.group];
      const requested = pool.get(line.id);
      const room = budget.capPerPerson - used.get(budget.id);
      const perPerson = Math.max(0, Math.min(requested, room));
      pool.set(line.id, requested - perPerson);
      used.set(budget.id, used.get(budget.id) + perPerson);
      return {
        budgetId: budget.id,
        lineId: line.id,
        name: line.name,
        date: line.date,
        requested,
        perPerson,
        left: requested - perPerson,
        overBudget: perPerson < requested,
        // 다른 예산에 먼저 일부를 넣고 남은 금액을 넣은 경우
        remainder: requested < line.perPerson
      };
    });
  return { results, remaining, used };
}

function unassignedLines(lines, pool) {
  return lines
    .filter(line => pool.get(line.id) > 0)
    .map(line => ({ lineId: line.id, name: line.name, date: line.date, perPerson: pool.get(line.id), full: pool.get(line.id) === line.perPerson }));
}

function findSplits(results, budgets) {
  const nameOf = new Map(budgets.map(budget => [budget.id, budget.name]));
  const regular = new Set(budgets.filter(budget => budget.group === 'regular').map(budget => budget.id));
  const byLine = new Map();
  for (const result of results) {
    if (!regular.has(result.budgetId) || result.perPerson <= 0) continue;
    if (!byLine.has(result.lineId)) byLine.set(result.lineId, { name: result.name, pieces: [] });
    byLine.get(result.lineId).pieces.push({ budgetName: nameOf.get(result.budgetId), perPerson: result.perPerson });
  }
  return [...byLine.values()].filter(item => item.pieces.length > 1);
}

export function buildProposal(project) {
  const plan = normalizeProposalPlan(project.proposalPlan);
  const c = projectCounts(project);
  const counts = { regular: c.regularParticipants, vulnerable: c.vulnerableParticipants, dayAbsent: c.contractedAbsent };
  const lines = studentCostLines(project);
  const budgets = proposalBudgets(project, counts);
  const { results, remaining, used } = replay(budgets, lines, plan.allocations);

  const blocks = budgets.map(budget => {
    const usedPerPerson = used.get(budget.id);
    const parts = results
      .filter(result => result.budgetId === budget.id)
      .map(result => ({ ...result, total: result.perPerson * budget.count }));
    const unusedPerPerson = Number.isFinite(budget.capPerPerson) ? budget.capPerPerson - usedPerPerson : null;
    return {
      budget,
      parts,
      usedPerPerson,
      unusedPerPerson,
      full: unusedPerPerson !== null && unusedPerPerson <= 0,
      total: usedPerPerson * budget.count
    };
  });

  const dayAbsent = counts.dayAbsent > 0
    ? lines.filter(line => line.includesDayAbsent).map(line => ({
      lineId: line.id, name: line.name, count: counts.dayAbsent, perPerson: line.perPerson, total: line.perPerson * counts.dayAbsent
    }))
    : [];
  const dayAbsentTotal = dayAbsent.reduce((sum, row) => sum + row.total, 0);

  const unassigned = {
    vulnerable: unassignedLines(lines, remaining.vulnerable),
    regular: unassignedLines(lines, remaining.regular)
  };
  const vulnerableBurdenPerPerson = sumLines(unassigned.vulnerable, 'perPerson');
  const vulnerableBurden = {
    count: counts.vulnerable,
    perPerson: vulnerableBurdenPerPerson,
    total: vulnerableBurdenPerPerson * counts.vulnerable
  };
  const regularUnassignedPerPerson = sumLines(unassigned.regular, 'perPerson');

  const blockTotal = id => blocks.find(block => block.budget.id === id).total;
  const educationTotal = blockTotal(VULNERABLE_BUDGET_ID) + blockTotal(EDUCATION_BUDGET_ID) + dayAbsentTotal;
  const education = project.educationSupport ?? {};
  const grantTotal = education.grantTotal === null || education.grantTotal === undefined || education.grantTotal === ''
    ? null : number(education.grantTotal);

  const assignedTotal = blocks.reduce((sum, block) => sum + block.total, 0) + dayAbsentTotal + vulnerableBurden.total;
  const unassignedTotal = regularUnassignedPerPerson * counts.regular;

  return {
    lines,
    budgets,
    counts,
    results,
    blocks,
    dayAbsent,
    dayAbsentTotal,
    unassigned,
    vulnerableBurden,
    regularUnassignedPerPerson,
    splits: findSplits(results, budgets),
    perPersonTotal: sumLines(lines, 'perPerson'),
    education: { total: educationTotal, grantTotal, balance: grantTotal === null ? null : grantTotal - educationTotal },
    assignedTotal,
    unassignedTotal,
    costTotal: sumLines(lines, 'total')
  };
}

/** 한 예산에서 각 항목의 상태(체크 여부, 넣은 금액, 넣을 수 있는 금액). 예산 카드를 그릴 때 쓴다. */
export function budgetChecklist(proposal, budgetId) {
  const budget = proposal.budgets.find(item => item.id === budgetId);
  const pool = budget.group === 'vulnerable' ? proposal.unassigned.vulnerable : proposal.unassigned.regular;
  const available = new Map(pool.map(item => [item.lineId, item.perPerson]));
  const budgetFull = proposal.blocks.find(block => block.budget.id === budgetId)?.full ?? false;
  return proposal.lines.map(line => {
    const result = proposal.results.find(item => item.budgetId === budgetId && item.lineId === line.id) ?? null;
    const amount = available.get(line.id) ?? 0;
    return {
      line,
      checked: Boolean(result),
      result,
      available: amount,
      // 예산이 가득 찼거나 다른 예산에 모두 넣은 항목은 더 체크할 수 없다.
      locked: !result && (amount <= 0 || budgetFull),
      lockReason: !result && amount <= 0 ? 'assigned' : (!result && budgetFull ? 'full' : null)
    };
  });
}

export function findAllocationResult(proposal, budgetId, lineId) {
  return proposal.results.find(item => item.budgetId === budgetId && item.lineId === lineId) ?? null;
}
