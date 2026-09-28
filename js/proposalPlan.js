/**
 * 품의 도우미에서 사용자가 정한 값만 저장한다. 금액은 저장하지 않고 매번 다시 계산한다.
 *
 * project.proposalPlan = {
 *   allocations: [{ budgetId, lineId }, ...]   // 예산 카드에서 항목을 체크한 순서
 * }
 * 체크한 순서대로 다시 채워 보기 때문에, 단가나 예산이 바뀌어도 금액이 저절로 맞춰진다.
 */
export function createProposalPlan() {
  return { allocations: [] };
}

function allocationKey({ budgetId, lineId }) {
  return `${budgetId}\u0000${lineId}`;
}

function uniqueAllocations(allocations) {
  const seen = new Set();
  return allocations.filter(allocation => {
    const key = allocationKey(allocation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 이전 버전(항목마다 예산 하나를 고르던 방식)의 저장값을 체크 순서로 옮긴다.
function fromLegacyAssignments(source) {
  const assignments = source.assignments && typeof source.assignments === 'object' ? source.assignments : {};
  const order = Array.isArray(source.order) ? source.order.map(String) : [];
  const ids = [...order, ...Object.keys(assignments).filter(id => !order.includes(id))];
  return ids
    .filter(lineId => typeof assignments[lineId] === 'string' && assignments[lineId])
    .map(lineId => ({ budgetId: assignments[lineId], lineId }));
}

export function normalizeProposalPlan(value) {
  const source = value && typeof value === 'object' ? value : {};
  const allocations = Array.isArray(source.allocations)
    ? source.allocations
      .filter(item => item && typeof item === 'object')
      .map(item => ({ budgetId: String(item.budgetId ?? ''), lineId: String(item.lineId ?? '') }))
      .filter(item => item.budgetId && item.lineId)
    : fromLegacyAssignments(source);
  return { allocations: uniqueAllocations(allocations) };
}

export function hasAllocation(plan, budgetId, lineId) {
  return plan.allocations.some(item => item.budgetId === budgetId && item.lineId === lineId);
}

export function addAllocations(plan, budgetId, lineIds) {
  return normalizeProposalPlan({ allocations: [...plan.allocations, ...lineIds.map(lineId => ({ budgetId, lineId }))] });
}

export function removeAllocation(plan, budgetId, lineId) {
  return { allocations: plan.allocations.filter(item => !(item.budgetId === budgetId && item.lineId === lineId)) };
}
