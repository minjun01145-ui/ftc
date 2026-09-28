import { number, uid } from './utils.js';

/**
 * 예산 입력 모델.
 *
 * - 교육청 지원금: project.educationSupport (비취약 1인당, 취약 1인당/실비 전액, 교부액) + 칸별 메모
 * - 기타 지원금:   project.otherSupports = [{ id, name, source, mode, amount, memo }]
 *   source: 'school'(학교 예산) 또는 'external'(지자체 등 외부 지원) — 정산 서식의 학교부담/외부지원 칸을 가른다.
 *   학교 자체지원금, 문화예술체험활동비, 지자체 지원금처럼 학교마다 여러 개일 수 있다.
 *   모두 비취약계층 참여 학생에게 쓰는 돈으로 본다(취약계층은 교육청 지원금으로 처리).
 */
export const OTHER_SUPPORT_MODES = Object.freeze({
  perPerson: '1인당',
  total: '총액'
});

export const OTHER_SUPPORT_SOURCES = Object.freeze({
  school: '학교',
  external: '외부'
});

export const EDUCATION_MEMO_KEYS = Object.freeze(['regular', 'vulnerable', 'grant']);

export function createOtherSupport(overrides = {}) {
  return {
    id: uid('support'),
    name: '',
    source: 'school',
    mode: 'perPerson',
    amount: 0,
    memo: '',
    ...overrides
  };
}

export function normalizeEducationMemos(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(EDUCATION_MEMO_KEYS.map(key => [key, String(source[key] ?? '')]));
}

function normalizeOtherSupport(value) {
  const base = createOtherSupport();
  const source = value && typeof value === 'object' ? value : {};
  return {
    id: String(source.id || base.id),
    name: String(source.name ?? ''),
    source: Object.hasOwn(OTHER_SUPPORT_SOURCES, source.source) ? source.source : 'school',
    mode: Object.hasOwn(OTHER_SUPPORT_MODES, source.mode) ? source.mode : 'perPerson',
    amount: Math.max(0, Math.round(number(source.amount))),
    memo: String(source.memo ?? '')
  };
}

/**
 * 저장된 기타 지원금 목록을 정리한다.
 * 이전 버전의 단일 '학교 자체 지원금'(project.schoolSupport)은 목록의 첫 항목으로 옮긴다.
 */
export function normalizeOtherSupports(value, legacySchoolSupport) {
  if (Array.isArray(value)) return value.map(normalizeOtherSupport);
  const legacyAmount = Math.max(0, number(legacySchoolSupport?.amount));
  if (!legacyAmount) return [];
  return [normalizeOtherSupport({
    name: '학교 자체지원금',
    mode: legacySchoolSupport?.mode === 'perPersonRegular' ? 'perPerson' : 'total',
    amount: legacyAmount
  })];
}

/** 비취약계층 참여 학생 1인당 쓸 수 있는 금액. 총액은 인원으로 나누고 원 단위 미만은 버린다. */
export function otherSupportPerPerson(support, regularParticipants) {
  const amount = Math.max(0, number(support?.amount));
  if (support?.mode === 'total') {
    const people = Math.max(0, Math.floor(number(regularParticipants)));
    return people > 0 ? Math.floor(amount / people) : 0;
  }
  return amount;
}

/** 기타 지원금 전체 금액(비취약계층 참여 학생 기준). */
export function otherSupportsTotal(supports, regularParticipants) {
  return (supports ?? []).reduce((sum, support) => sum + (support.mode === 'total'
    ? Math.max(0, number(support.amount))
    : Math.max(0, number(support.amount)) * Math.max(0, Math.floor(number(regularParticipants)))), 0);
}
