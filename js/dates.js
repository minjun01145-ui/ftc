/** 'YYYY-MM-DD' → '5월 13일(수)'. 형식이 맞지 않으면 빈 문자열. */
export function koreanDateLabel(isoDate) {
  const match = String(isoDate ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${Number(match[2])}월 ${Number(match[3])}일(${'일월화수목금토'[date.getDay()]})`;
}
