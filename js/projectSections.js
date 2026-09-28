export const PROJECT_SECTION = Object.freeze({
  WORKFLOW: 'workflow',
  OVERVIEW: 'overview',
  BUSINESS: 'business',
  HEADCOUNT: 'headcount',
  EXPENSES: 'expenses',
  BUDGET: 'budget',
  PRE_TRIP: 'preTrip',
  PROPOSAL: 'proposal',
  REPORT: 'report',
  SETTLEMENT: 'settlement'
});

export const PROJECT_SECTION_ITEMS = Object.freeze([
  { key: PROJECT_SECTION.BUSINESS, label: '사업정보' },
  { key: PROJECT_SECTION.HEADCOUNT, label: '인원' },
  { key: PROJECT_SECTION.EXPENSES, label: '체험처/비용' },
  { key: PROJECT_SECTION.BUDGET, label: '예산 관리' },
  { key: PROJECT_SECTION.PRE_TRIP, label: '학생 1인별 금액 산출내역 보기' },
  { key: PROJECT_SECTION.PROPOSAL, label: '품의 도우미' },
  { key: PROJECT_SECTION.REPORT, label: '리포트 보기' },
  { key: PROJECT_SECTION.SETTLEMENT, label: '정산' }
]);

const validSections = new Set(PROJECT_SECTION_ITEMS.map(item => item.key));

// 없어진 메뉴(업무 흐름, 전체보기)로 저장된 위치는 사업정보로 연다.
export function normalizeProjectSection(value) {
  return validSections.has(value) ? value : PROJECT_SECTION.BUSINESS;
}

export function projectSectionLabel(value) {
  const key = normalizeProjectSection(value);
  return PROJECT_SECTION_ITEMS.find(item => item.key === key)?.label ?? '사업정보';
}
