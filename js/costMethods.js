import { number } from './utils.js';

/**
 * 체험처/비용 표의 "계산방법" 선택지. 표에는 단가(또는 총액) 하나만 입력하고,
 * 계산방법이 엔진의 calcMethod/quantityBase를 정한다. 둘 사이 변환은 이 모듈에서만 한다.
 *
 * 학생용
 * - perParticipant : 1인당 금액. 실제 참여 학생 수 × 단가 (신청 후 불참자 제외)
 * - studentTotal   : 학생 총액. (실제 참여 + 신청 후 불참) × 단가 — 신청 후 불참자도 부담한다.
 * 인솔자용
 * - perStaff       : 1인당 금액. 인솔자 수 × 단가
 * - staffTotal     : 총액. 입력한 금액 그대로
 *
 * 어느 선택지에도 맞지 않는 예전 항목은 '기존 방식'으로 보여 주고 계산 방식과 금액을 그대로 보존한다.
 */
const perPerson = quantityBase => ({
  matches: expense => expense.calcMethod === 'perPerson' && (quantityBase === null || expense.quantityBase === quantityBase),
  amountOf: expense => number(expense.unitAmount),
  apply: (expense, amount) => ({
    ...expense, calcMethod: 'perPerson', quantityBase: quantityBase ?? 'participants', customQuantity: 0, unitAmount: amount, planAmount: 0
  })
});

const total = () => ({
  matches: expense => expense.calcMethod === 'fixedStudent',
  amountOf: expense => number(expense.planAmount),
  apply: (expense, amount) => ({ ...expense, calcMethod: 'fixedStudent', unitAmount: 0, planAmount: amount })
});

export const COST_METHODS = Object.freeze({
  student: Object.freeze([
    { value: 'perParticipant', label: '1인당 금액', ...perPerson('participants') },
    { value: 'studentTotal', label: '학생 총액(신청 후 불참 포함)', ...perPerson('participantsPlusAbsent') }
  ]),
  staff: Object.freeze([
    { value: 'perStaff', label: '1인당 금액', ...perPerson(null) },
    { value: 'staffTotal', label: '총액', ...total() }
  ])
});

export const LEGACY_METHOD = Object.freeze({ value: 'legacy', label: '기존 방식' });

function methodsFor(kind) {
  return COST_METHODS[kind] ?? COST_METHODS.student;
}

export function costMethodOf(kind, expense) {
  return methodsFor(kind).find(method => method.matches(expense))?.value ?? LEGACY_METHOD.value;
}

/** 표의 계산방법 선택지. 예전 항목이면 '기존 방식'을 덧붙인다. */
export function costMethodOptions(kind, expense) {
  const selected = costMethodOf(kind, expense);
  const methods = methodsFor(kind).map(({ value, label }) => ({ value, label }));
  return selected === LEGACY_METHOD.value ? [...methods, LEGACY_METHOD] : methods;
}

/** 표의 금액 입력칸에 보여 줄 값. 예전 항목은 저장된 계산 방식에 맞는 금액을 보여 준다. */
export function costInputAmount(kind, expense) {
  const method = methodsFor(kind).find(item => item.value === costMethodOf(kind, expense));
  if (method) return method.amountOf(expense);
  return expense.calcMethod === 'perPerson' ? number(expense.unitAmount) : number(expense.planAmount);
}

/** 표에서 고른 계산방법과 금액을 비용 항목 필드로 바꾼다. */
export function applyCostMethod(kind, expense, methodValue, amount) {
  const value = Math.max(0, number(amount));
  const method = methodsFor(kind).find(item => item.value === methodValue);
  if (method) return method.apply(expense, value);
  // '기존 방식'을 그대로 두면 계산 방식은 유지하고 금액만 바꾼다.
  return expense.calcMethod === 'perPerson'
    ? { ...expense, unitAmount: value }
    : { ...expense, planAmount: value };
}
