import { applyCostMethod, costInputAmount } from './costMethods.js';
import { projectCounts } from './engine.js';
import { fixedCostBreakdown, normalizeFixedCosts } from './fixedCosts.js';
import { createExpense } from './presets.js';

/**
 * 체험처/비용(인솔자용) 초안.
 * 1) 학생용 체험처를 그대로 가져와 '1인당 금액(인솔자 수 × 단가)'으로 바꾼다.
 * 2) 기타비에서 인솔자 몫을 만든다.
 *    - 1인당 금액 기타비(숙소비·보험비 등)          → 같은 단가를 인솔자 1인당 금액으로
 *    - 전체 계약액 + 인솔자도 함께 부담(버스비 등) → 학생과 같은 1인당 금액을 인솔자 1인당 금액으로
 *    - 전체 계약액에서 버리고 남은 금액            → '○○ 버림 잔액' 총액
 * 사용자는 이 초안을 보고 고치면 된다.
 */
export function cloneExpensesForStaff(expenses) {
  return expenses.map(expense => {
    const { id: _id, ...copy } = expense;
    const cloned = createExpense({ ...copy, details: { ...(expense.details ?? {}) } });
    return expense.calcMethod === 'perPerson'
      ? applyCostMethod('staff', cloned, 'perStaff', costInputAmount('student', expense))
      : cloned;
  });
}

function fixedCostStaffRows(project) {
  const c = projectCounts(project);
  const counts = { participants: c.participants, dayAbsent: c.contractedAbsent, chaperones: c.chaperones };
  const options = { dayAbsentSharesCommonCost: Boolean(project.dayAbsentSharesCommonCost) };
  return normalizeFixedCosts(project.fixedCosts)
    .filter(entry => entry.amount > 0)
    .flatMap(entry => {
      const name = entry.label || '기타비';
      const breakdown = fixedCostBreakdown(entry, counts, options);
      const rows = [];
      const perStaff = entry.mode === 'perPerson' ? entry.amount : (entry.includeChaperones ? breakdown.perPerson : 0);
      if (perStaff > 0) rows.push(applyCostMethod('staff', createExpense({ name }), 'perStaff', perStaff));
      if (breakdown.remainder > 0) {
        rows.push(applyCostMethod('staff', createExpense({ name: `${name} 버림 잔액` }), 'staffTotal', breakdown.remainder));
      }
      return rows;
    });
}

export function buildStaffDraft(project) {
  const venues = cloneExpensesForStaff((project.expenses ?? []).filter(expense => String(expense.name ?? '').trim()));
  return [...venues, ...fixedCostStaffRows(project)];
}
