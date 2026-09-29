import { number, uid } from './utils.js';

/**
 * 체험처/비용 화면의 '기타비'. 저장 키는 예전 이름 그대로 project.fixedCosts를 쓴다.
 *
 * project.fixedCosts = [{ id, builtin, label, mode, amount, includeChaperones, roundTo10, commonCost, memo }, ...]
 * - 기본 항목(버스비·숙소비·보험비)은 builtin에 키가 있고 지울 수 없다. 사용자가 항목을 더 추가할 수 있다.
 * - mode 'perPerson' : 입력한 1인당 금액을 그대로 쓴다.
 * - mode 'total'     : 전체 계약액을 인원으로 나눠 1인당 금액을 만든다.
 *     includeChaperones : 학생 + 인솔자 수로 나눈다(아니면 학생 수만).
 *     roundTo10         : 1인당 금액의 1원 단위를 버린다(10원 단위로 맞춤).
 *   나누고 남은 금액(인솔자 몫, 버림 잔액)은 학생 부담에서 빠지고 인솔자 비용으로 넘어간다.
 *     sharedPeople : 다른 학년과 함께 계산. 1·3학년이 버스를 같이 타는 경우처럼 다른 사업 인원을 더해서 나눈다.
 *                    더한 인원 몫은 이 사업 비용이 아니다. sharedNote에 어디서 가져왔는지 적어 둔다.
 *     headcount    : (이전 버전) 전체 계산 인원을 직접 넣은 값. sharedPeople이 없을 때만 쓴다.
 * - commonCost : 공통비. 인원 화면의 '신청 후 불참자 공통비 부담'을 체크하면 신청 후 불참자도 학생 수에 들어간다.
 *
 * 예) 버스비 9,000,000원 ÷ (학생 71명 + 인솔자 8명) = 113,924원 → 113,920원
 *     학생 71명 × 113,920원 = 8,088,320원, 인솔자 8명 × 113,920원 = 911,360원, 버림 잔액 320원
 */
export const FIXED_COST_MODES = Object.freeze({
  perPerson: '1인당 금액',
  total: '전체 계약액'
});

export const BUILTIN_FIXED_COSTS = Object.freeze([
  Object.freeze({ key: 'bus', label: '버스비', category: 'vehicle', commonCost: true, mode: 'total', includeChaperones: true }),
  Object.freeze({ key: 'lodging', label: '숙소비', category: 'lodging', commonCost: true, mode: 'total', includeChaperones: false }),
  Object.freeze({ key: 'insurance', label: '보험비', category: 'insurance', commonCost: false, mode: 'perPerson', includeChaperones: false })
]);

export const FIXED_COST_EXPENSE_ID_PREFIX = 'fixed-';

function builtinEntry(builtin, source = {}) {
  return normalizeEntry({ ...source, id: builtin.key, builtin: builtin.key, label: builtin.label }, builtin);
}

export function createCustomFixedCost(overrides = {}) {
  return normalizeEntry({ id: uid('custom'), builtin: null, label: '', mode: 'perPerson', ...overrides });
}

export function createFixedCosts() {
  return BUILTIN_FIXED_COSTS.map(builtin => builtinEntry(builtin));
}

function normalizeEntry(source, builtin = null) {
  return {
    id: String(source.id || uid('custom')),
    builtin: builtin ? builtin.key : null,
    label: builtin ? builtin.label : String(source.label ?? ''),
    mode: Object.hasOwn(FIXED_COST_MODES, source.mode) ? source.mode : (builtin?.mode ?? 'perPerson'),
    amount: Math.max(0, Math.round(number(source.amount))),
    // 이전 버전은 버스비만 인솔자와 나눴고, 항상 10원 단위로 버렸다.
    includeChaperones: typeof source.includeChaperones === 'boolean' ? source.includeChaperones : Boolean(builtin?.includeChaperones),
    roundTo10: typeof source.roundTo10 === 'boolean' ? source.roundTo10 : true,
    headcount: Math.max(0, Math.floor(number(source.headcount))) || null,
    sharedPeople: Math.max(0, Math.floor(number(source.sharedPeople))),
    sharedNote: String(source.sharedNote ?? ''),
    // 공통비: 신청 후 불참자도 부담하는 항목(버스비·숙소비는 처음부터 체크). 사용자가 바꿀 수 있다.
    commonCost: typeof source.commonCost === 'boolean' ? source.commonCost : Boolean(builtin?.commonCost),
    memo: String(source.memo ?? '')
  };
}

/**
 * 저장된 기타비를 정리한다. 기본 항목은 항상 앞에 두고, 사용자가 추가한 항목을 뒤에 붙인다.
 * 이전 버전의 { bus: {...}, lodging: {...}, insurance: {...} } 형태도 받는다.
 */
export function normalizeFixedCosts(value) {
  const entries = Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object')
    : Object.entries(value && typeof value === 'object' ? value : {}).map(([key, entry]) => ({ ...entry, builtin: key }));
  const builtins = BUILTIN_FIXED_COSTS.map(builtin => builtinEntry(builtin, entries.find(entry => entry.builtin === builtin.key)));
  const custom = entries.filter(entry => !entry.builtin).map(entry => normalizeEntry(entry));
  return [...builtins, ...custom];
}

export function fixedCostLineId(entry) {
  return `${FIXED_COST_EXPENSE_ID_PREFIX}${entry.id}`;
}

const floorTo = (value, unit) => Math.floor(value / unit) * unit;
const won = value => `${Math.round(number(value)).toLocaleString('ko-KR')}원`;

/**
 * 기타비 한 항목의 학생 1인당 금액, 학생 합계, 인솔자 몫, 버림 잔액.
 * counts: { participants, dayAbsent, chaperones }
 */
export function fixedCostBreakdown(entry, counts, { dayAbsentSharesCommonCost = false } = {}) {
  const amount = Math.max(0, number(entry?.amount));
  const includesDayAbsent = Boolean(entry?.commonCost && dayAbsentSharesCommonCost);
  const dayAbsent = includesDayAbsent ? Math.max(0, number(counts.dayAbsent)) : 0;
  const students = Math.max(0, number(counts.participants)) + dayAbsent;
  const base = { amount, students, includesDayAbsent, dayAbsent };

  if (entry?.mode === 'perPerson') {
    return { ...base, mode: 'perPerson', perPerson: amount, chaperones: 0, divisor: students, studentTotal: amount * students, chaperoneTotal: 0, remainder: 0, roundTo10: false };
  }
  const chaperones = entry?.includeChaperones ? Math.max(0, number(counts.chaperones)) : 0;
  const ownPeople = students + chaperones;
  // 다른 학년과 함께 계산하면 그 인원을 더해 나눈다. 이전 버전의 전체 인원 입력은 이 사업 인원보다 적게 나누지 않는다.
  const sharedPeople = Math.max(0, Math.floor(number(entry?.sharedPeople)));
  const divisor = sharedPeople > 0
    ? ownPeople + sharedPeople
    : (entry?.headcount ? Math.max(entry.headcount, ownPeople) : ownPeople);
  const otherPeople = divisor - ownPeople;
  const perPerson = divisor > 0 && students > 0 ? floorTo(amount / divisor, entry?.roundTo10 ? 10 : 1) : 0;
  const studentTotal = perPerson * students;
  const chaperoneTotal = perPerson * chaperones;
  const otherTotal = perPerson * otherPeople;
  return {
    ...base,
    mode: 'total',
    perPerson,
    chaperones,
    divisor,
    customHeadcount: divisor !== ownPeople,
    otherPeople,
    otherTotal,
    studentTotal,
    chaperoneTotal,
    remainder: students > 0 ? amount - studentTotal - chaperoneTotal - otherTotal : 0,
    roundTo10: Boolean(entry?.roundTo10)
  };
}

/** 1인당 금액이 어떻게 나왔는지 사람이 읽을 수 있게 설명한다(산출내역 비고란). */
export function fixedCostBasisText(breakdown) {
  const absent = breakdown.includesDayAbsent && breakdown.dayAbsent > 0 ? `(신청 후 불참 ${breakdown.dayAbsent}명 포함)` : '';
  if (breakdown.mode === 'perPerson') return `1인당 금액 ${won(breakdown.perPerson)} 입력, 학생 ${breakdown.students}명${absent}`;
  const people = breakdown.chaperones > 0
    ? `(학생 ${breakdown.students}명${absent} + 인솔자 ${breakdown.chaperones}명)`
    : `학생 ${breakdown.students}명${absent}`;
  const rounding = breakdown.remainder > 0 ? `, ${breakdown.roundTo10 ? '1원 단위' : '원 미만'} 버림` : '';
  if (breakdown.customHeadcount) {
    const others = breakdown.otherPeople > 0 ? `, 다른 학년 ${breakdown.otherPeople}명 포함` : '';
    const own = `학생 ${breakdown.students}명${absent}${breakdown.chaperones > 0 ? ` + 인솔자 ${breakdown.chaperones}명` : ''}`;
    return `총액 ${won(breakdown.amount)} ÷ 계산 인원 ${breakdown.divisor}명(이 사업 ${own}${others})${rounding}`;
  }
  return `총액 ${won(breakdown.amount)} ÷ ${people}${rounding}`;
}

function countsOptions(project) {
  return { dayAbsentSharesCommonCost: Boolean(project?.dayAbsentSharesCommonCost) };
}

/**
 * 금액이 입력된 기타비를 비용 계산 엔진이 쓰는 학생 1인당 비용 항목으로 바꾼다.
 * 1인당 금액을 미리 계산해 두므로 엔진은 다른 체험처와 똑같이 '1인당 금액 × 인원'으로 계산한다.
 */
export function fixedCostExpenses(project, counts) {
  return normalizeFixedCosts(project?.fixedCosts)
    .filter(entry => entry.amount > 0)
    .map(entry => {
      const breakdown = fixedCostBreakdown(entry, counts, countsOptions(project));
      return {
        id: fixedCostLineId(entry),
        fixedCostKey: entry.id,
        date: '',
        name: entry.label || '기타비',
        description: entry.memo,
        basis: fixedCostBasisText(breakdown),
        category: BUILTIN_FIXED_COSTS.find(builtin => builtin.key === entry.builtin)?.category ?? 'other',
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

/**
 * 전체 계약액에서 학생 몫을 빼고 남은 금액: 인솔자 몫과 버림 잔액. 인솔자 비용으로 처리한다.
 * 예) 버스비 → 인솔자 8명 × 113,920원 = 911,360원, 버림 잔액 320원
 */
export function fixedCostStaffShares(project, counts) {
  return normalizeFixedCosts(project?.fixedCosts)
    .filter(entry => entry.amount > 0 && entry.mode === 'total')
    .flatMap(entry => {
      const breakdown = fixedCostBreakdown(entry, counts, countsOptions(project));
      const label = entry.label || '기타비';
      const shares = [];
      if (breakdown.chaperoneTotal > 0) {
        shares.push({ id: `${entry.id}-chaperones`, label: `${label} 인솔자 몫`, kind: 'chaperones', count: breakdown.chaperones, perPerson: breakdown.perPerson, total: breakdown.chaperoneTotal });
      }
      if (breakdown.remainder > 0) {
        shares.push({ id: `${entry.id}-remainder`, label: `${label} 버림 잔액`, kind: 'remainder', count: null, perPerson: null, total: breakdown.remainder });
      }
      return shares;
    });
}
