import { number } from './utils.js';

/**
 * 체험처/비용에서 입력하는 고정비(버스비·숙소비·보험비).
 *
 * 저장 형태: project.fixedCosts = { bus: { mode, amount, memo }, lodging: {...}, insurance: {...} }
 * - mode 'perPerson' : 1인당 금액을 그대로 쓴다.
 * - mode 'total'     : 전체 계약액을 나눠 1인당 금액을 만든다. 10원 미만은 버리고,
 *                      나누고 남은 금액은 학생 부담에서 빠진다(버스비는 인솔자 몫).
 *
 * 공통비용(commonCost): 인원 화면에서 '당일 불참자 공통비용 부담'을 체크하면 당일 불참자도 나눠 낸다.
 * 인솔자 분담(sharedWithChaperones): 버스비는 학생과 인솔자가 함께 나눈다.
 *
 * 예) 버스비 9,000,000원 / (학생 71명 + 인솔자 8명) = 113,924원 → 113,920원
 */
export const FIXED_COST_MODES = Object.freeze({
  perPerson: '1인당 금액',
  total: '전체 계약액'
});

export const FIXED_COST_ITEMS = Object.freeze([
  Object.freeze({ key: 'bus', label: '버스비', category: 'vehicle', modes: Object.freeze(['total']), commonCost: true, sharedWithChaperones: true }),
  Object.freeze({ key: 'lodging', label: '숙소비', category: 'lodging', modes: Object.freeze(['perPerson', 'total']), commonCost: true, sharedWithChaperones: false }),
  Object.freeze({ key: 'insurance', label: '보험비', category: 'insurance', modes: Object.freeze(['perPerson', 'total']), commonCost: false, sharedWithChaperones: false })
]);

export const FIXED_COST_EXPENSE_ID_PREFIX = 'fixed-';

export function createFixedCosts() {
  return Object.fromEntries(FIXED_COST_ITEMS.map(item => [item.key, { mode: item.modes[0], amount: 0, memo: '' }]));
}

export function normalizeFixedCosts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(FIXED_COST_ITEMS.map(item => {
    const entry = source[item.key] && typeof source[item.key] === 'object' ? source[item.key] : {};
    return [item.key, {
      mode: item.modes.includes(entry.mode) ? entry.mode : item.modes[0],
      amount: Math.max(0, Math.round(number(entry.amount))),
      memo: String(entry.memo ?? '')
    }];
  }));
}

const floorTo10 = value => Math.floor(value / 10) * 10;

/**
 * 고정비 한 항목의 학생 1인당 금액과 학생 부담 합계.
 * counts: { participants, dayAbsent, chaperones }
 */
export function fixedCostBreakdown(item, entry, counts, { dayAbsentSharesCommonCost = false } = {}) {
  const amount = Math.max(0, number(entry?.amount));
  const includesDayAbsent = Boolean(item.commonCost && dayAbsentSharesCommonCost);
  const students = Math.max(0, number(counts.participants)) + (includesDayAbsent ? Math.max(0, number(counts.dayAbsent)) : 0);

  if (entry?.mode === 'perPerson') {
    return { perPerson: amount, students, divisor: students, studentTotal: amount * students, remainder: 0, includesDayAbsent };
  }
  const chaperones = item.sharedWithChaperones ? Math.max(0, number(counts.chaperones)) : 0;
  const divisor = students + chaperones;
  const perPerson = divisor > 0 && students > 0 ? floorTo10(amount / divisor) : 0;
  const studentTotal = perPerson * students;
  return { perPerson, students, divisor, studentTotal, remainder: amount - studentTotal, includesDayAbsent };
}

function describe(entry, breakdown) {
  if (entry.mode !== 'total') return '';
  return `${entry.amount.toLocaleString('ko-KR')}원 / ${breakdown.divisor}명`;
}

/**
 * 금액이 입력된 고정비를 비용 계산 엔진이 쓰는 학생 1인당 비용 항목으로 바꾼다.
 * 1인당 금액을 미리 계산해 두므로 엔진은 다른 체험처와 똑같이 '1인당 금액 × 인원'으로 계산한다.
 */
export function fixedCostExpenses(project, counts) {
  const fixedCosts = normalizeFixedCosts(project?.fixedCosts);
  const options = { dayAbsentSharesCommonCost: Boolean(project?.dayAbsentSharesCommonCost) };
  return FIXED_COST_ITEMS
    .filter(item => fixedCosts[item.key].amount > 0)
    .map(item => {
      const entry = fixedCosts[item.key];
      const breakdown = fixedCostBreakdown(item, entry, counts, options);
      return {
        id: `${FIXED_COST_EXPENSE_ID_PREFIX}${item.key}`,
        fixedCostKey: item.key,
        date: '',
        name: item.label,
        description: describe(entry, breakdown),
        category: item.category,
        costOwner: 'student',
        calcMethod: 'perPerson',
        quantityBase: breakdown.includesDayAbsent ? 'participantsPlusAbsent' : 'participants',
        unitAmount: breakdown.perPerson,
        planAmount: 0,
        actualAmount: null,
        rounding: 'floor10',
        customQuantity: 0,
        customCohorts: null,
        note: entry.memo
      };
    });
}
