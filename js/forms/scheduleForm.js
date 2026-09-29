import { escapeHtml } from '../utils.js';

/**
 * 계획서에 넣는 '세부 일정표' (일자 | 장소 | 시간 | 상세일정 | 비고).
 * 사업정보의 체험학습 일정에서 만들며, 화면 미리보기·한글 붙여넣기(HTML)·HWPX 파일이 모두 이 모양을 쓴다.
 *
 * model = {
 *   rows: [{ time, detail: [줄], note: [줄] }],          // 본문 한 줄씩
 *   days: [{ start, span, label: ['제1일차', '5/13(수)'] }],  // 일자 칸(병합)
 *   places: [{ start, span, text }]                         // 장소 칸(병합)
 * }
 */
export const SCHEDULE_FORM_COLUMNS = Object.freeze(['일 자', '장소', '시간', '상세일정', '비고']);

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dayLabel(date, index) {
  const match = String(date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [`제${index + 1}일차`];
  const [, year, month, day] = match.map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return [`제${index + 1}일차`, `${month}/${day}(${weekday})`];
}

function timeText(item) {
  const start = String(item.arrivalTime ?? '').trim();
  const end = String(item.departureTime ?? '').trim();
  if (start && end) return `${start}~${end}`;
  return start || end;
}

// '롯데월드 체험 (야간관람 포함)'처럼 긴 이름은 괄호 앞에서 줄을 바꾼다(견본 일정표와 같은 모양).
function detailLines(name) {
  const text = String(name ?? '').trim();
  const match = text.match(/^(.+?)\s+(\([^()]+\))$/);
  return match && text.length > 14 ? [match[1], match[2]] : [text];
}

function noteLines(note) {
  return String(note ?? '').split(/\n/).map(line => line.trim()).filter(Boolean);
}

export function scheduleFormModel(project) {
  const items = Array.isArray(project?.tripSchedule?.items) ? project.tripSchedule.items : [];
  const rows = [];
  const days = [];
  const places = [];
  for (const item of items) {
    const index = rows.length;
    const date = String(item.date ?? '');
    const lastDay = days.at(-1);
    if (lastDay && lastDay.date === date) lastDay.span += 1;
    else days.push({ date, start: index, span: 1, label: dayLabel(date, days.length) });

    const place = String(item.place ?? '').trim();
    const lastPlace = places.at(-1);
    const sameDay = days.at(-1).start <= (lastPlace?.start ?? -1);
    if (lastPlace && sameDay && lastPlace.text === place) lastPlace.span += 1;
    else places.push({ start: index, span: 1, text: place });

    rows.push({ time: timeText(item), detail: detailLines(item.name), note: noteLines(item.contact) });
  }
  return { rows, days, places };
}

/* ---------- HTML(화면 미리보기, 한글 붙여넣기) ---------- */

// 한글의 HTML 붙여넣기는 CSS보다 표 속성(border, bgcolor, width)을 잘 읽으므로 둘 다 적는다.
const WIDTHS = [11, 13, 17, 39, 20];
const FONT = "font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:10pt;";
const LINE = 'border:1px solid #000;';
const lines = list => list.map(escapeHtml).join('<br>');

function td(content, { rowspan = 1, width = null, header = false, style = '' } = {}) {
  const tag = header ? 'th' : 'td';
  const attrs = [
    rowspan > 1 ? `rowspan="${rowspan}"` : '',
    width ? `width="${width}%"` : '',
    header ? 'bgcolor="#BFBFBF"' : '',
    'align="center"',
    'valign="middle"'
  ].filter(Boolean).join(' ');
  const background = header ? 'background:#BFBFBF;font-weight:bold;' : '';
  return `<${tag} ${attrs} style="${LINE}${FONT}${background}padding:3px 5px;text-align:center;vertical-align:middle;white-space:nowrap;${style}">${content}</${tag}>`;
}

/** 인라인 스타일과 표 속성만 쓰는 표. 한글에 붙여넣어도 테두리·병합·음영이 남는다. */
export function scheduleFormHtml(model, { title = '세부 일정표' } = {}) {
  const dayAt = new Map(model.days.map(day => [day.start, day]));
  const placeAt = new Map(model.places.map(place => [place.start, place]));
  const head = SCHEDULE_FORM_COLUMNS
    .map((name, index) => td(escapeHtml(name), { header: true, width: WIDTHS[index], style: 'border-bottom:3px double #000;' }))
    .join('');
  const body = model.rows.map((row, index) => {
    const cells = [];
    const day = dayAt.get(index);
    if (day) cells.push(td(lines(day.label), { rowspan: day.span }));
    const place = placeAt.get(index);
    if (place) cells.push(td(lines(place.text.split(/\s*\n\s*/)), { rowspan: place.span }));
    cells.push(td(escapeHtml(row.time)));
    cells.push(td(lines(row.detail)));
    cells.push(td(lines(row.note)));
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  const empty = model.rows.length ? '' : `<tr>${td('일정이 없습니다.').replace('<td ', '<td colspan="5" ')}</tr>`;
  return `<p style="${FONT}font-size:12pt;font-weight:bold;margin:0 0 6px;">${escapeHtml(title)}</p>`
    + `<table border="1" cellspacing="0" cellpadding="3" width="100%" style="border-collapse:collapse;border:2px solid #000;${FONT}">`
    + `<thead><tr>${head}</tr></thead><tbody>${body}${empty}</tbody></table>`;
}

/** 붙여넣기용 일반 글자(탭으로 칸 구분). */
export function scheduleFormText(model) {
  const dayAt = new Map(model.days.map(day => [day.start, day]));
  const placeAt = new Map(model.places.map(place => [place.start, place]));
  return [
    SCHEDULE_FORM_COLUMNS.join('\t'),
    ...model.rows.map((row, index) => [
      dayAt.get(index)?.label.join(' ') ?? '',
      placeAt.get(index)?.text ?? '',
      row.time,
      row.detail.join(' '),
      row.note.join(' ')
    ].join('\t'))
  ].join('\n');
}
