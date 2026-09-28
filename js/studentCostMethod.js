import { number } from './utils.js';

/**
 * 학생용 체험처 비용표의 "계산방법" 선택지.
 *
 * 화면에서는 단가 하나만 입력하고, 계산방법이 수량을 정한다.
 * - perParticipant : 1인당 금액. 실제 참여 학생 수 × 단가 (당일 불참자 제외)
 * - studentTotal   : 학생 총액. (실제 참여 + 당일 불참) × 단가 — 당일 불참자도 부담한다.
 *
 * 엔진은 여전히 calcMethod/quantityBase로 계산하므로, 둘 사이 변환은 이 모듈에서만 한다.
 * 이전 버전에서 총액(planAmount)으로 저장한 항목은 'legacyTotal'로 보여 주고 그대로 보존한다.
 */
export const STUDENT_COST_METHODS = Object.freeze([
  Object.freeze({ value: 'perParticipant', label: '1인당 금액', quantityBase: 'participants' }),
  Object.freeze({ value: 'studentTotal', label: '학생 총액(당일 불참 포함)', quantityBase: 'participantsPlusAbsent' })
]);

export const LEGACY_TOTAL_METHOD = Object.freeze({ value: 'legacyTotal', label: '기존 총액' });

export function studentCostMethodOf(expense) {
  if (expense?.calcMethod !== 'perPerson') return LEGACY_TOTAL_METHOD.value;
  return STUDENT_COST_METHODS.find(method => method.quantityBase === expense.quantityBase)?.value
    ?? STUDENT_COST_METHODS[0].value;
}

/** 화면 입력칸에 보여 줄 금액. 기존 총액 항목은 총액을, 나머지는 단가를 보여 준다. */
export function studentCostInputAmount(expense) {
  return studentCostMethodOf(expense) === LEGACY_TOTAL_METHOD.value
    ? number(expense.planAmount)
    : number(expense.unitAmount);
}

/** 화면에서 고른 계산방법과 금액을 비용 항목 필드로 바꾼다. */
export function applyStudentCostMethod(expense, methodValue, amount) {
  const value = Math.max(0, number(amount));
  if (methodValue === LEGACY_TOTAL_METHOD.value && expense.calcMethod !== 'perPerson') {
    return { ...expense, planAmount: value, unitAmount: 0 };
  }
  const method = STUDENT_COST_METHODS.find(item => item.value === methodValue) ?? STUDENT_COST_METHODS[0];
  return {
    ...expense,
    calcMethod: 'perPerson',
    quantityBase: method.quantityBase,
    customQuantity: 0,
    unitAmount: value,
    planAmount: 0
  };
}
