import { number } from './utils.js';

/**
 * 사업정보에서 입력하는 고정비(버스비·숙소비·보험비).
 *
 * 저장 형태: project.fixedCosts = { bus: { mode, amount }, lodging: {...}, insurance: {...} }
 * - mode 'total'     : 전체 계약액. 실제 참여 학생 수로 나눠 1인당 금액을 계산한다.
 * - mode 'perPerson' : 1인당 금액. 실제 참여 학생 수를 곱해 합계를 계산한다.
 *
 * 비용 계산 엔진은 이 모듈이 만든 비용 항목(fixedCostExpenses)만 알면 되고,
 * 화면은 FIXED_COST_ITEMS 목록만 보고 입력칸을 그린다.
 */
export const FIXED_COST_MODES = Object.freeze({
  perPerson: '1인당 금액',
  total: '전체 계약액'
});

export const FIXED_COST_ITEMS = Object.freeze([
  Object.freeze({ key: 'bus', label: '버스비', category: 'vehicle', modes: Object.freeze(['total']) }),
  Object.freeze({ key: 'lodging', label: '숙소비', category: 'lodging', modes: Object.freeze(['perPerson', 'total']) }),
  Object.freeze({ key: 'insurance', label: '보험비', category: 'insurance', modes: Object.freeze(['perPerson', 'total']) })
]);

export const FIXED_COST_EXPENSE_ID_PREFIX = 'fixed-';

export function createFixedCosts() {
  return Object.fromEntries(FIXED_COST_ITEMS.map(item => [item.key, { mode: item.modes[0], amount: 0 }]));
}

export function normalizeFixedCosts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(FIXED_COST_ITEMS.map(item => {
    const entry = source[item.key] && typeof source[item.key] === 'object' ? source[item.key] : {};
    return [item.key, {
      mode: item.modes.includes(entry.mode) ? entry.mode : item.modes[0],
      amount: Math.max(0, Math.round(number(entry.amount)))
    }];
  }));
}

/** 참여 학생 수 기준 1인당 금액과 학생 합계. 참여자가 없으면 1인당 금액은 0이다. */
export function fixedCostAmounts(entry, participants) {
  const amount = Math.max(0, number(entry?.amount));
  const people = Math.max(0, Math.floor(number(participants)));
  if (entry?.mode === 'perPerson') {
    return { perPerson: amount, total: Math.round(amount * people) };
  }
  return { perPerson: people > 0 ? amount / people : 0, total: amount };
}

/**
 * 금액이 입력된 고정비를 비용 계산 엔진이 쓰는 학생 비용 항목 형태로 바꾼다.
 * 모두 실제 참여 학생 기준으로 계산한다.
 */
export function fixedCostExpenses(project) {
  const fixedCosts = normalizeFixedCosts(project?.fixedCosts);
  return FIXED_COST_ITEMS
    .filter(item => fixedCosts[item.key].amount > 0)
    .map(item => {
      const { mode, amount } = fixedCosts[item.key];
      const perPerson = mode === 'perPerson';
      return {
        id: `${FIXED_COST_EXPENSE_ID_PREFIX}${item.key}`,
        fixedCostKey: item.key,
        date: String(project?.startDate ?? ''),
        name: item.label,
        category: item.category,
        costOwner: 'student',
        calcMethod: perPerson ? 'perPerson' : 'fixedStudent',
        quantityBase: 'participants',
        unitAmount: perPerson ? amount : 0,
        planAmount: perPerson ? 0 : amount,
        actualAmount: null,
        rounding: 'floor10',
        customQuantity: 0,
        customCohorts: null,
        note: '사업정보 고정비'
      };
    });
}
