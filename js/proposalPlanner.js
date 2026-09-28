import { otherSupportPerPerson } from './budget.js';
import { studentCostLines, sumLines } from './costLines.js';
import { projectCounts } from './engine.js';
import { normalizeProposalPlan } from './proposalPlan.js';
import { number } from './utils.js';

/**
 * 품의 도우미 계산.
 *
 * 비취약계층 학생 1인 비용을 예산 순서대로 채운다(교육청 → 기타 지원금 → 수익자 부담).
 * 한 예산의 1인당 한도를 넘는 항목은 한도까지만 넣고, 남은 금액을 다음 예산 맨 앞으로 넘긴다.
 *   예) 롯데월드 자유이용권 30,000원 → 교육청 13,500원 + 학교 자체지원금 16,500원
 * '지정 항목 전용' 예산은 직접 배정한 항목만 받고, 앞에서 넘어온 금액은 건너뛴다.
 * 마지막 수익자 부담은 한도가 없어 남은 금액을 모두 받는다.
 *
 * 취약계층과 당일 불참 학생 몫은 교육청 지원금에서 따로 품의한다(엑셀 '예산별 품의 내용'과 같은 구성).
 */
export const EDUCATION_BUDGET_ID = 'education';
export const STUDENT_BUDGET_ID = 'student';

export function proposalBudgets(project, regularParticipants) {
  const education = project.educationSupport ?? {};
  return [
    {
      id: EDUCATION_BUDGET_ID,
      name: '교육청 지원금',
      capPerPerson: Math.max(0, number(education.regularPerPerson)),
      restricted: false
    },
    ...(project.otherSupports ?? []).map(support => ({
      id: support.id,
      name: support.name || '이름 없는 지원금',
      capPerPerson: otherSupportPerPerson(support, regularParticipants),
      restricted: Boolean(support.restricted)
    })),
    { id: STUDENT_BUDGET_ID, name: '수익자 부담', capPerPerson: Number.POSITIVE_INFINITY, restricted: false }
  ];
}

/** 저장된 순서대로 항목을 정렬한다. 새로 생긴 항목은 원래 순서대로 뒤에 붙는다. */
export function orderLines(lines, order = []) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return lines
    .map((line, index) => ({ line, key: rank.has(line.id) ? rank.get(line.id) : order.length + index }))
    .sort((left, right) => left.key - right.key)
    .map(item => item.line);
}

function assignedBudgetId(line, plan, budgetIds) {
  const budgetId = plan.assignments[line.id];
  return budgetIds.has(budgetId) ? budgetId : STUDENT_BUDGET_ID;
}

function fillBudgets(budgets, lines, plan) {
  const budgetIds = new Set(budgets.map(budget => budget.id));
  const assignedTo = budgetId => lines
    .filter(line => assignedBudgetId(line, plan, budgetIds) === budgetId)
    .map(line => ({ line, amount: line.perPerson, carried: false }));

  let carry = [];
  return budgets.map(budget => {
    const queue = budget.restricted ? assignedTo(budget.id) : [...carry, ...assignedTo(budget.id)];
    let remaining = budget.capPerPerson;
    const parts = [];
    const overflow = [];
    for (const piece of queue) {
      const take = Math.min(piece.amount, remaining);
      if (take > 0) {
        parts.push({ lineId: piece.line.id, name: piece.line.name, date: piece.line.date, perPerson: take, carried: piece.carried });
        remaining -= take;
      }
      if (piece.amount > take) overflow.push({ line: piece.line, amount: piece.amount - take, carried: true });
    }
    carry = budget.restricted ? [...carry, ...overflow] : overflow;
    const usedPerPerson = parts.reduce((sum, part) => sum + part.perPerson, 0);
    return {
      budget,
      parts,
      usedPerPerson,
      unusedPerPerson: Number.isFinite(budget.capPerPerson) ? budget.capPerPerson - usedPerPerson : 0
    };
  });
}

function findSplits(blocks) {
  const pieces = new Map();
  for (const block of blocks) {
    for (const part of block.parts) {
      if (!pieces.has(part.lineId)) pieces.set(part.lineId, { name: part.name, pieces: [] });
      pieces.get(part.lineId).pieces.push({ budgetName: block.budget.name, perPerson: part.perPerson });
    }
  }
  return [...pieces.values()].filter(item => item.pieces.length > 1);
}

export function buildProposal(project) {
  const plan = normalizeProposalPlan(project.proposalPlan);
  const counts = projectCounts(project);
  const regularCount = counts.regularParticipants;
  const vulnerableCount = counts.vulnerableParticipants;
  const dayAbsentCount = counts.contractedAbsent;

  const lines = orderLines(studentCostLines(project), plan.order);
  const budgets = proposalBudgets(project, regularCount);
  const perPersonTotal = sumLines(lines, 'perPerson');

  const education = project.educationSupport ?? {};
  const vulnerableEducationPerPerson = education.vulnerableMode === 'perPerson'
    ? Math.min(perPersonTotal, Math.max(0, number(education.vulnerablePerPerson)))
    : perPersonTotal;
  const vulnerable = {
    count: vulnerableCount,
    perPerson: vulnerableEducationPerPerson,
    total: vulnerableEducationPerPerson * vulnerableCount,
    burdenPerPerson: perPersonTotal - vulnerableEducationPerPerson,
    burdenTotal: (perPersonTotal - vulnerableEducationPerPerson) * vulnerableCount
  };

  const dayAbsent = dayAbsentCount > 0
    ? lines.filter(line => line.includesDayAbsent).map(line => ({
      lineId: line.id, name: line.name, count: dayAbsentCount, perPerson: line.perPerson, total: line.perPerson * dayAbsentCount
    }))
    : [];
  const dayAbsentTotal = dayAbsent.reduce((sum, row) => sum + row.total, 0);

  const blocks = fillBudgets(budgets, lines, plan).map(block => ({
    ...block,
    count: regularCount,
    total: block.usedPerPerson * regularCount,
    parts: block.parts.map(part => ({ ...part, total: part.perPerson * regularCount }))
  }));

  const educationBlock = blocks.find(block => block.budget.id === EDUCATION_BUDGET_ID);
  const educationTotal = vulnerable.total + educationBlock.total + dayAbsentTotal;
  const grantTotal = education.grantTotal === null || education.grantTotal === undefined || education.grantTotal === ''
    ? null : number(education.grantTotal);

  const costTotal = sumLines(lines, 'total');
  const proposalTotal = vulnerable.total + vulnerable.burdenTotal + dayAbsentTotal
    + blocks.reduce((sum, block) => sum + block.total, 0);

  return {
    lines,
    budgets,
    assignments: Object.fromEntries(lines.map(line => [line.id, assignedBudgetId(line, plan, new Set(budgets.map(b => b.id)))])),
    counts: { regular: regularCount, vulnerable: vulnerableCount, dayAbsent: dayAbsentCount },
    perPersonTotal,
    vulnerable,
    dayAbsent,
    dayAbsentTotal,
    blocks,
    splits: findSplits(blocks),
    education: {
      total: educationTotal,
      grantTotal,
      balance: grantTotal === null ? null : grantTotal - educationTotal
    },
    costTotal,
    proposalTotal
  };
}
