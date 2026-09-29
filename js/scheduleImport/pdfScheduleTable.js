import { columnFinder, groupLines, nearestBy } from './pdfLayout.js';
import { normalizeSpaces, parseDayNumber, parseMonthDay, parseTimeRange, scheduleTitle, startsNewDay } from './scheduleText.js';

/**
 * PDF의 '세부 일정' 표(일자 | 장소 | 시간 | 상세일정 | 비고)를 행으로 복원한다.
 *
 * 1) '시간'과 '상세일정(일정·내용)' 머리글이 있는 줄을 찾아 열 경계를 정한다.
 * 2) 시간 열의 '12:00 ~ 20:30' 같은 조각 하나가 일정 한 행이다.
 * 3) 상세일정·비고 열의 글자는 높이가 가장 가까운 시간 행에 붙인다(셀 안 줄바꿈 포함).
 * 4) 일자 열의 '제1일차', '5월13일(수)'은 날짜 표시로 모아 두고,
 *    시간이 앞 행보다 이르면 다음 날로 넘어간 것으로 보고 날짜를 차례로 붙인다.
 * 표가 여러 쪽에 걸치면 머리글이 없는 쪽은 앞쪽의 열 경계를 그대로 쓴다.
 */
const HEADERS = Object.freeze([
  { key: 'date', pattern: /^(일\s*자|날\s*짜|월\s*일|일\s*차)$/ },
  { key: 'place', pattern: /^(장\s*소|장소\s*\/\s*체험처)$/ },
  { key: 'time', pattern: /^(시\s*간)$/ },
  { key: 'detail', pattern: /^(상세\s*일정|세부\s*일정|일\s*정|내\s*용|활동\s*내용|주요\s*활동|세부\s*내용)$/ },
  { key: 'note', pattern: /^(비\s*고|참\s*고)$/ }
]);
const ROW_REACH = 35;     // 시간 행에서 이만큼(pt) 떨어진 글자까지 같은 행으로 본다.
const MARKER_MERGE = 25;  // '제1일차'와 '5월13일(수)'처럼 붙어 있는 날짜 표시는 하나로 합친다.
const PLACE_MERGE = 18;   // '잠실'과 '롯데월드'처럼 한 칸 안에서 줄바꿈한 장소는 하나로 합친다.

function findHeader(page) {
  for (const line of groupLines(page.items)) {
    const columns = line.items
      .map(item => ({ item, header: HEADERS.find(header => header.pattern.test(normalizeSpaces(item.text))) }))
      .filter(entry => entry.header)
      .map(entry => ({ key: entry.header.key, x: entry.item.x }));
    const keys = new Set(columns.map(column => column.key));
    if (keys.has('time') && keys.has('detail')) return { y: line.y, columns };
  }
  return null;
}

function mergeMarkers(markers) {
  const merged = [];
  for (const marker of [...markers].sort((left, right) => right.y - left.y)) {
    const near = merged.find(candidate => Math.abs(candidate.y - marker.y) <= MARKER_MERGE);
    if (near) {
      near.monthDay ??= marker.monthDay;
      near.dayNumber ??= marker.dayNumber;
    } else {
      merged.push({ ...marker });
    }
  }
  return merged.filter(marker => marker.monthDay || marker.dayNumber);
}

function readPage(page, columns, headerY) {
  const columnOf = columnFinder(columns);
  const cells = page.items
    .filter(item => item.y < headerY - 2)
    .map(item => ({ ...item, column: columnOf(item.x) }));

  const rows = cells
    .filter(cell => cell.column === 'time')
    .map(cell => ({ cell, time: parseTimeRange(cell.text) }))
    .filter(entry => entry.time)
    .map(entry => ({ pageNumber: page.pageNumber, y: entry.cell.y, ...entry.time, details: [], notes: [] }))
    .sort((left, right) => right.y - left.y);

  for (const cell of cells) {
    if (cell.column !== 'detail' && cell.column !== 'note') continue;
    const row = nearestBy(rows, cell.y, candidate => candidate.y, ROW_REACH);
    if (row) (cell.column === 'detail' ? row.details : row.notes).push(cell);
  }

  // 장소 칸: 한 칸 안의 여러 줄을 합쳐 둔다. 일정 행에는 나중에 날별로 붙인다(assignPlaces).
  const places = [];
  for (const cell of cells.filter(item => item.column === 'place').sort((left, right) => right.y - left.y)) {
    const last = places.at(-1);
    if (last && last.bottom - cell.y <= PLACE_MERGE) {
      last.text = `${last.text} ${cell.text}`;
      last.bottom = cell.y;
      last.y = (last.top + cell.y) / 2;
    } else {
      places.push({ pageNumber: page.pageNumber, text: cell.text, top: cell.y, bottom: cell.y, y: cell.y });
    }
  }

  const markers = mergeMarkers(cells
    .filter(cell => cell.column === 'date')
    .map(cell => ({ pageNumber: page.pageNumber, y: cell.y, monthDay: parseMonthDay(cell.text), dayNumber: parseDayNumber(cell.text) })));

  return { rows, markers, places };
}

/**
 * 병합한 장소 칸의 글자는 그 칸이 덮는 행들의 가운데에 있다.
 * 그래서 날마다 행을 위에서부터 장소 개수만큼 이어진 묶음으로 나누되,
 * 각 묶음의 가운데 높이가 장소 글자 높이와 가장 가깝게 나눈다.
 */
function assignPlaces(rows, places) {
  const days = new Map();
  for (const row of rows) {
    const key = `${row.pageNumber}:${row.dayIndex}`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(row);
  }
  for (const dayRows of days.values()) {
    const ys = dayRows.map(row => row.y);
    const top = Math.max(...ys) + ROW_REACH;
    const bottom = Math.min(...ys) - ROW_REACH;
    const candidates = places
      .filter(place => place.pageNumber === dayRows[0].pageNumber && place.y <= top && place.y >= bottom)
      .sort((left, right) => right.y - left.y)
      .slice(0, dayRows.length);
    if (!candidates.length) continue;
    const n = dayRows.length;
    const m = candidates.length;
    const center = (from, to) => (dayRows[from].y + dayRows[to].y) / 2;
    // cost[j][i]: 앞 i개 행을 앞 j개 장소로 나눈 최소 오차
    const cost = Array.from({ length: m + 1 }, () => Array(n + 1).fill(Number.POSITIVE_INFINITY));
    const cut = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    cost[0][0] = 0;
    for (let j = 1; j <= m; j += 1) {
      for (let i = j; i <= n; i += 1) {
        for (let k = j - 1; k < i; k += 1) {
          const value = cost[j - 1][k] + Math.abs(center(k, i - 1) - candidates[j - 1].y);
          if (value < cost[j][i]) {
            cost[j][i] = value;
            cut[j][i] = k;
          }
        }
      }
    }
    let end = n;
    for (let j = m; j >= 1; j -= 1) {
      const start = cut[j][end];
      for (let index = start; index < end; index += 1) dayRows[index].place = normalizeSpaces(candidates[j - 1].text);
      end = start;
    }
  }
}

const joinByLine = cells => normalizeSpaces([...cells].sort((left, right) => right.y - left.y || left.x - right.x).map(cell => cell.text).join(' '));

/** 시간 순서로 날을 나누고, 날짜 표시를 차례로 붙인다. 개수가 맞지 않으면 가장 가까운 날짜 표시를 쓴다. */
function attachDates(rows, markers) {
  let dayIndex = 0;
  let previous = '';
  for (const row of rows) {
    const time = row.start || row.end;
    if (startsNewDay(previous, time)) dayIndex += 1;
    row.dayIndex = dayIndex;
    previous = time || previous;
  }
  const dayCount = dayIndex + 1;
  for (const row of rows) {
    const marker = markers.length === dayCount
      ? markers[row.dayIndex]
      : nearestBy(markers.filter(item => item.pageNumber === row.pageNumber), row.y, item => item.y);
    row.monthDay = marker?.monthDay ?? null;
    row.dayNumber = marker?.dayNumber ?? row.dayIndex + 1;
  }
}

/**
 * @param pages [{ pageNumber, items: [{ text, x, y }] }]
 * @returns [{ monthDay, dayNumber, start, end, title, note }]
 */
export function parseDetailedScheduleTable(pages) {
  const rows = [];
  const markers = [];
  const places = [];
  let columns = null;
  for (const page of pages) {
    const header = findHeader(page);
    if (header) columns = header.columns;
    if (!columns) continue;
    const result = readPage(page, columns, header ? header.y : Number.POSITIVE_INFINITY);
    rows.push(...result.rows);
    markers.push(...result.markers);
    places.push(...result.places);
  }
  attachDates(rows, markers);
  assignPlaces(rows, places);
  return rows
    .map(row => {
      const note = joinByLine(row.notes);
      return {
        monthDay: row.monthDay,
        dayNumber: row.dayNumber,
        start: row.start,
        end: row.end,
        title: scheduleTitle(joinByLine(row.details), note),
        note,
        place: row.place ?? ''
      };
    })
    .filter(row => row.title || row.note);
}
