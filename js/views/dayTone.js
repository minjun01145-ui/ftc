/**
 * 날짜별로 표를 알아보기 쉽게 하는 공통 도우미.
 * 같은 날짜는 같은 색(day-tone-0~4)을 쓰고, 날짜 순서로 1일차, 2일차…를 붙인다.
 */
import { koreanDateLabel } from '../dates.js';

const TONE_COUNT = 5;

/** 날짜 목록을 받아 날짜 → { dayNumber, tone } 를 돌려준다. 빈 날짜는 넣지 않는다. */
export function dayToneMap(dates) {
  const unique = [...new Set(dates.map(date => String(date ?? '')).filter(Boolean))].sort();
  return new Map(unique.map((date, index) => [date, { dayNumber: index + 1, tone: `day-tone-${index % TONE_COUNT}` }]));
}

export function dayToneClass(map, date) {
  return map.get(String(date ?? ''))?.tone ?? '';
}

export function dayHeading(map, date) {
  const info = map.get(String(date ?? ''));
  return info ? `${info.dayNumber}일차 · ${koreanDateLabel(date)}` : '날짜 미정';
}
