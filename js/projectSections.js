export const PROJECT_SECTION = Object.freeze({
  OVERVIEW: 'overview',
  BUSINESS: 'business',
  HEADCOUNT: 'headcount',
  EXPENSES: 'expenses',
  BUDGET: 'budget',
  REPORT: 'report',
  SETTLEMENT: 'settlement'
});

export const PROJECT_SECTION_ITEMS = Object.freeze([
  { key: PROJECT_SECTION.OVERVIEW, label: '전체보기' },
  { key: PROJECT_SECTION.BUSINESS, label: '사업정보' },
  { key: PROJECT_SECTION.HEADCOUNT, label: '인원' },
  { key: PROJECT_SECTION.EXPENSES, label: '체험처/비용' },
  { key: PROJECT_SECTION.BUDGET, label: '예산 관리' },
  { key: PROJECT_SECTION.REPORT, label: '리포트 보기' },
  { key: PROJECT_SECTION.SETTLEMENT, label: '정산' }
]);

const validSections = new Set(PROJECT_SECTION_ITEMS.map(item => item.key));

export function normalizeProjectSection(value) {
  return validSections.has(value) ? value : PROJECT_SECTION.OVERVIEW;
}

export function projectSectionLabel(value) {
  const key = normalizeProjectSection(value);
  return PROJECT_SECTION_ITEMS.find(item => item.key === key)?.label ?? '전체보기';
}
