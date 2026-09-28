import { number } from './utils.js';

/**
 * 체험처/비용 화면의 '기타비'(버스비·숙소비·보험비). 저장 키는 예전 이름 그대로 project.fixedCosts를 쓴다.
 *
 * project.fixedCosts = { bus: { mode, amount, includeChaperones, memo }, lodging: {...}, insurance: {...} }
 * - mode 'perPerson' : 입력한 1인당 금액을 그대로 쓴다.
 * - mode 'total'     : 전체 계약액을 인원으로 나눠 1인당 금액을 만든다(10원 미만 버림).
 *   includeChaperones가 켜져 있으면 학생 + 인솔자 수로 나눈다. 나누고 남은 금액은 학생 부담에서 빠진다.
 * 공통비용(commonCost): 인원 화면의 '당일 불참자 공통비용 부담'을 체크하면 당일 불참자도 학생 수에 들어간다.
 *
 * 예) 버스비 9,000,000원 ÷ (학생 71명 + 인솔자 8명) = 113,924원 → 113,920원
 */
export const FIXED_COST_MODES = Object.freeze({
  perPerson: '1인당 금액',
  total: '전체 계약액'
});

export const FIXED_COST_ITEMS = Object.freeze([
  Object.freeze({ key: 'bus', label: '버스비', category: 'vehicle', commonCost: true, defaultMode: 'total', defaultIncludeChaperones: true }),
  Object.freeze({ key: 'lodging', label: '숙소비', category: 'lodging', commonCost: true, defaultMode: 'total', defaultIncludeChaperones: false }),
  Object.freeze({ key: 'insurance', label: '보험비', category: 'insurance', commonCost: false, defaultMode: 'perPerson', defaultIncludeChaperones: false })
]);

export const FIXED_COST_EXPENSE_ID_PREFIX = 'fixed-';

export function createFixedCosts() {
  return Object.fromEntries(FIXED_COST_ITEMS.map(item => [item.key, {
    mode: item.defaultMode, amount: 0, includeChaperones: item.defaultIncludeChaperones, memo: ''
  }]));
}

export function normalizeFixedCosts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(FIXED_COST_ITEMS.map(item => {
    const entry = source[item.key] && typeof source[item.key] === 'object' ? source[item.key] : {};
    return [item.key, {
      mode: Object.hasOwn(FIXED_COST_MODES, entry.mode) ? entry.mode : item.defaultMode,
      amount: Math.max(0, Math.round(number(entry.amount))),
      // 이전 버전은 버스비만 항상 인솔자와 나눴으므로, 값이 없으면 항목 기본값을 쓴다.
      includeChaperones: typeof entry.includeChaperones === 'boolean' ? entry.includeChaperones : item.defaultIncludeChaperones,
      memo: String(entry.memo ?? '')
    }];
  }));
}

const floorTo10 = value => Math.floor(value / 10) * 10;
const won = value => `${Math.round(number(value)).toLocaleString('ko-KR')}원`;

/**
 * 기타비 한 항목의 학생 1인당 금액과 학생 부담 합계.
 * counts: { participants, dayAbsent, chaperones }
 */
export function fixedCostBreakdown(item, entry, counts, { dayAbsentSharesCommonCost = false } = {}) {
  const amount = Math.max(0, number(entry?.amount));
  const includesDayAbsent = Boolean(item.commonCost && dayAbsentSharesCommonCost);
  const dayAbsent = includesDayAbsent ? Math.max(0, number(counts.dayAbsent)) : 0;
  const students = Math.max(0, number(counts.participants)) + dayAbsent;

  if (entry?.mode === 'perPerson') {
    return { mode: 'perPerson', amount, perPerson: amount, students, chaperones: 0, divisor: students, studentTotal: amount * students, remainder: 0, includesDayAbsent, dayAbsent };
  }
  const chaperones = entry?.includeChaperones ? Math.max(0, number(counts.chaperones)) : 0;
  const divisor = students + chaperones;
  const perPerson = divisor > 0 && students > 0 ? floorTo10(amount / divisor) : 0;
  const studentTotal = perPerson * students;
  return { mode: 'total', amount, perPerson, students, chaperones, divisor, studentTotal, remainder: amount - studentTotal, includesDayAbsent, dayAbsent };
}

/** 1인당 금액이 어떻게 나왔는지 사람이 읽을 수 있게 설명한다(산출내역 비고란). */
export function fixedCostBasisText(breakdown) {
  const absent = breakdown.includesDayAbsent && breakdown.dayAbsent > 0 ? `(당일 불참 ${breakdown.dayAbsent}명 포함)` : '';
  if (breakdown.mode === 'perPerson') return `1인당 금액 ${won(breakdown.perPerson)} 입력, 학생 ${breakdown.students}명${absent}`;
  const people = breakdown.chaperones > 0
    ? `(학생 ${breakdown.students}명${absent} + 인솔자 ${breakdown.chaperones}명)`
    : `학생 ${breakdown.students}명${absent}`;
  const exact = breakdown.divisor > 0 && breakdown.amount / breakdown.divisor === breakdown.perPerson;
  return `총액 ${won(breakdown.amount)} ÷ ${people}${exact ? '' : ', 10원 미만 버림'}`;
}

/**
 * 금액이 입력된 기타비를 비용 계산 엔진이 쓰는 학생 1인당 비용 항목으로 바꾼다.
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
        description: entry.memo,
        basis: fixedCostBasisText(breakdown),
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
        note: ''
      };
    });
}
