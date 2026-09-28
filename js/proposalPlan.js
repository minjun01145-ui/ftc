/**
 * 품의 도우미에서 사용자가 정한 값만 저장한다. 계산 결과는 저장하지 않고 매번 다시 만든다.
 *
 * project.proposalPlan = {
 *   assignments: { [비용 항목 id]: 예산 id },   // 배정하지 않은 항목은 수익자 부담
 *   order: [비용 항목 id, ...]                  // 예산 안에서 품의에 올릴 순서
 * }
 */
export function createProposalPlan() {
  return { assignments: {}, order: [] };
}

export function normalizeProposalPlan(value) {
  const source = value && typeof value === 'object' ? value : {};
  const assignments = source.assignments && typeof source.assignments === 'object' ? source.assignments : {};
  return {
    assignments: Object.fromEntries(Object.entries(assignments)
      .filter(([itemId, budgetId]) => itemId && typeof budgetId === 'string' && budgetId)
      .map(([itemId, budgetId]) => [String(itemId), budgetId])),
    order: Array.isArray(source.order) ? [...new Set(source.order.map(String).filter(Boolean))] : []
  };
}
