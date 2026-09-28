/**
 * 일정 문서에서 자주 나오는 글자 모양(시간, 날짜, 일차, 연도)을 읽는 도우미.
 * PDF와 HWPX 해석기가 함께 쓴다. DOM이나 라이브러리에 의존하지 않는다.
 */
const TIME = /([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/g;

function pad(value) {
  return String(value).padStart(2, '0');
}

export function normalizeSpaces(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * '12:00 ~ 20:30', '06:30 ~', '~ 18:30', '21:00' 같은 시간 칸을 읽는다.
 * 물결(~) 앞의 시간은 시작, 뒤의 시간은 끝으로 본다. 시간이 없으면 null.
 */
export function parseTimeRange(text) {
  const source = String(text ?? '');
  const times = [...source.matchAll(TIME)].map(match => ({ value: `${pad(match[1])}:${match[2]}`, index: match.index }));
  if (!times.length) return null;
  const tilde = source.search(/[~∼〜－-]/);
  if (times.length >= 2) return { start: times[0].value, end: times[1].value };
  if (tilde >= 0 && times[0].index > tilde) return { start: '', end: times[0].value };
  return { start: times[0].value, end: '' };
}

/** '5월 13일(수)', '5월13일', '5. 13.(수)' → { month, day } */
export function parseMonthDay(text) {
  const source = String(text ?? '');
  const korean = source.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (korean) return { month: Number(korean[1]), day: Number(korean[2]) };
  const dotted = source.match(/(?:^|[^\d.])(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*\(\s*[월화수목금토일]\s*\)/);
  if (dotted) return { month: Number(dotted[1]), day: Number(dotted[2]) };
  return null;
}

/** '제1일차', '2일차' → 1, 2 */
export function parseDayNumber(text) {
  const match = String(text ?? '').match(/제?\s*(\d{1,2})\s*일\s*차/);
  return match ? Number(match[1]) : null;
}

/** 문서 안의 '2026년 5월', '2026. 5. 13.' 같은 표현에서 연도를 찾는다. 없으면 fallback. */
export function detectYear(texts, fallback) {
  const joined = texts.join(' ');
  const withMonth = joined.match(/(20\d{2})\s*년\s*\d{1,2}\s*월/) ?? joined.match(/(20\d{2})\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}/);
  if (withMonth) return Number(withMonth[1]);
  const numericFallback = Number(fallback);
  return Number.isInteger(numericFallback) && numericFallback > 2000 ? numericFallback : new Date().getFullYear();
}

export function isoDate(year, monthDay) {
  if (!monthDay) return '';
  return `${year}-${pad(monthDay.month)}-${pad(monthDay.day)}`;
}

const MEAL_TITLE = /^(조식|중식|석식)$/;

/**
 * 일정 이름을 다듬는다. 상세일정이 '중식'뿐이고 비고에 '중식: 덕평휴게소'가 있으면 '중식(덕평휴게소)'로 쓴다.
 */
export function scheduleTitle(title, note) {
  const name = normalizeSpaces(title);
  if (!MEAL_TITLE.test(name)) return name;
  const place = String(note ?? '').match(new RegExp(`${name}\\s*[:：]\\s*([^\\n,]+)`));
  return place ? `${name}(${normalizeSpaces(place[1])})` : name;
}

/** 시간이 앞 행보다 이르면 다음 날로 넘어간 것으로 본다(06:30 … 21:00 → 07:00). */
export function startsNewDay(previousTime, time) {
  return Boolean(previousTime && time && time < previousTime);
}
