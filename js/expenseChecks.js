import { activeFixedCosts } from './fixedCosts.js';
import { koreanDateLabel } from './dates.js';
import { number } from './utils.js';

/**
 * 체험처/비용 기초자료 점검. 저장을 막지 않고, 확인해 볼 만한 것만 알려 준다.
 * - 단가: 0원, 너무 적음, 1원 단위로 끝남, 다른 항목보다 지나치게 큼(0을 하나 더 붙였을 수 있음)
 * - 식사: 날짜별 조식·중식·석식이 있는지(첫날 조식, 마지막 날 석식은 없어도 넘어간다)
 * - 기타비: 숙박형인데 숙소비가 없거나, 버스비·보험비가 비어 있는지
 * - 날짜: 체험학습 기간 밖의 날짜, 같은 날 같은 이름의 중복 항목
 */
const MEALS = Object.freeze([
  { key: 'breakfast', label: '조식', pattern: /조식|아침/ },
  { key: 'lunch', label: '중식', pattern: /중식|점심|도시락|밀쿠폰|식사/ },
  { key: 'dinner', label: '석식', pattern: /석식|저녁/ }
]);
const PRICED_NAME = /식|입장|관람|이용권|체험|티켓|쿠폰|요금|공연/;
const TOO_SMALL = 1000;
const OUTLIER_RATIO = 5;
const OUTLIER_MIN = 100_000;

function tripDates(startDate, endDate) {
  const parse = text => {
    const match = String(text ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  };
  const start = parse(startDate);
  const end = parse(endDate) ?? start;
  if (!start || end < start) return [];
  const dates = [];
  for (let time = start.getTime(); time <= end.getTime() && dates.length < 31; time += 86_400_000) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function unitOf(expense) {
  return expense.calcMethod === 'perPerson' ? number(expense.unitAmount) : number(expense.planAmount);
}

function label(expense) {
  const date = koreanDateLabel(expense.date);
  return `${date ? `${date} ` : ''}${expense.name}`;
}

function priceIssues(expenses) {
  const issues = [];
  const perPersonPrices = expenses.filter(expense => expense.calcMethod === 'perPerson').map(unitOf).filter(value => value > 0);
  const typical = median(perPersonPrices);
  for (const expense of expenses) {
    if (!expense.name.trim()) continue;
    const unit = unitOf(expense);
    if (unit <= 0) {
      if (PRICED_NAME.test(expense.name)) issues.push(`${label(expense)}: 단가가 0원입니다. 무료가 맞는지 확인하세요.`);
      continue;
    }
    if (expense.calcMethod === 'perPerson' && unit < TOO_SMALL) issues.push(`${label(expense)}: 단가 ${unit.toLocaleString('ko-KR')}원은 너무 적습니다. 단가를 확인하세요.`);
    if (unit % 10 !== 0) issues.push(`${label(expense)}: 단가가 ${unit.toLocaleString('ko-KR')}원으로 1원 단위에서 끝납니다. 단가를 확인하세요.`);
    if (expense.calcMethod === 'perPerson' && perPersonPrices.length >= 3 && unit >= OUTLIER_MIN && unit >= typical * OUTLIER_RATIO) {
      issues.push(`${label(expense)}: 단가 ${unit.toLocaleString('ko-KR')}원이 다른 항목보다 훨씬 큽니다. 0을 하나 더 붙이지 않았는지 확인하세요.`);
    }
  }
  return issues;
}

function mealIssues(expenses, dates) {
  const issues = [];
  dates.forEach((date, index) => {
    const names = expenses.filter(expense => expense.date === date).map(expense => expense.name);
    const missing = MEALS
      .filter(meal => !(index === 0 && dates.length > 1 && meal.key === 'breakfast'))
      .filter(meal => !(index === dates.length - 1 && dates.length > 1 && meal.key === 'dinner'))
      .filter(meal => !names.some(name => meal.pattern.test(name)))
      .map(meal => meal.label);
    if (missing.length) issues.push(`${koreanDateLabel(date)}: ${missing.join('·')}이(가) 없습니다. 정말 없는지 확인하세요.`);
  });
  return issues;
}

function scheduleIssues(expenses, dates) {
  const issues = [];
  const inTrip = new Set(dates);
  const seen = new Set();
  for (const expense of expenses) {
    if (dates.length && expense.date && !inTrip.has(expense.date)) {
      issues.push(`${label(expense)}: 체험학습 기간 밖의 날짜입니다.`);
    }
    const key = `${expense.date}\u0000${expense.name.trim()}`;
    if (expense.name.trim() && seen.has(key)) issues.push(`${label(expense)}: 같은 날 같은 이름의 항목이 두 번 있습니다.`);
    seen.add(key);
  }
  return issues;
}

function fixedCostIssues(project, dates) {
  const issues = [];
  const all = new Map(activeFixedCosts(project.fixedCosts).filter(entry => entry.builtin).map(entry => [entry.builtin, entry]));
  // 삭제한 기본 항목은 일부러 뺀 것이므로 입력하라고 하지 않는다.
  const byKey = { get: key => (all.has(key) ? all.get(key) : { amount: 1 }) };
  const overnight = project.executionMode === '숙박형' || dates.length > 1;
  if (!byKey.get('bus')?.amount) issues.push('기타비: 버스비가 입력되지 않았습니다.');
  if (overnight && !byKey.get('lodging')?.amount) issues.push('기타비: 숙박형인데 숙소비가 입력되지 않았습니다.');
  if (!byKey.get('insurance')?.amount) issues.push('기타비: 보험비가 입력되지 않았습니다.');
  return issues;
}

export function checkStudentExpenses(project) {
  const expenses = (project.expenses ?? []).map(expense => ({ ...expense, name: String(expense.name ?? ''), date: String(expense.date ?? '') }));
  const dates = tripDates(project.startDate, project.endDate);
  return [
    ...priceIssues(expenses),
    ...mealIssues(expenses, dates),
    ...scheduleIssues(expenses, dates),
    ...fixedCostIssues(project, dates)
  ];
}
