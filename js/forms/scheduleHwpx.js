import { buildHwpx, downloadBlob, escapeXml } from './hwpxPackage.js';
import { SCHEDULE_FORM_COLUMNS, scheduleFormText } from './scheduleForm.js';

/**
 * 세부 일정표를 한글 파일(HWPX)로 만든다.
 * 견본 파일(templates/schedule-hwpx)의 글꼴·테두리·쪽 설정을 그대로 쓰고, 표만 일정에 맞게 새로 만든다.
 * 줄 배치(linesegarray)는 넣지 않는다. 한글이 파일을 열 때 다시 계산한다.
 * 표는 글자처럼 취급하지 않는다(treatAsChar=0). 그래야 표가 길면 다음 쪽으로 나뉘고 머리글 줄이 반복된다.
 */

// 견본 표의 열 너비와 행 높이(HWPUNIT, 1/7200인치)
const WIDTHS = [5137, 5846, 7560, 18617, 8897];
const TABLE_WIDTH = WIDTHS.reduce((sum, width) => sum + width, 0);
const HEADER_HEIGHT = 2131;
const LINE_HEIGHT = 1848;
const EXTRA_LINE = 1600;
const CELL_PADDING = 282;
const CHAR_WIDTH = 1000; // 10pt 한글 한 글자

// header.xml의 테두리(borderFill) 번호: 바깥 굵은 선, 머리글 아래 이중선, 맨 아래 굵은 선
const HEADER_FILLS = [6, 7, 8, 8, 9];
const BODY_FILLS = {
  first: { left: 10, inner: 11, right: 12 },
  middle: { left: 17, inner: 13, right: 14 },
  last: { left: 25, inner: 30, right: 31 }
};
const HEADER_CHAR = 33;
const BODY_CHAR = 34;
const CELL_PARA = 36;

function visualWidth(text) {
  return [...String(text)].reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? 0.55 : 1), 0) * CHAR_WIDTH;
}

function lineCount(lines, column) {
  const room = WIDTHS[column] - CELL_PADDING;
  return Math.max(1, lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(visualWidth(line) / room)), 0));
}

function paragraphs(lines, charPr) {
  const list = lines.length ? lines : [''];
  return list.map(line => `<hp:p id="2147483648" paraPrIDRef="${CELL_PARA}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${
    line ? `<hp:run charPrIDRef="${charPr}"><hp:t>${escapeXml(line)}</hp:t></hp:run>` : `<hp:run charPrIDRef="${charPr}"/>`
  }</hp:p>`).join('');
}

function cell({ col, row, span = 1, height, fill, lines, header = false }) {
  return `<hp:tc name="" header="${header ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${fill}">`
    + '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
    + paragraphs(lines, header ? HEADER_CHAR : BODY_CHAR)
    + `</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="${span}"/>`
    + `<hp:cellSz width="${WIDTHS[col]}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;
}

function fillFor(column, firstRow, lastRow) {
  const place = lastRow ? 'last' : (firstRow ? 'first' : 'middle');
  // 첫 행이면서 마지막 행(하루짜리 한 줄)이면 머리글 아래 이중선을 살린다.
  const set = firstRow && lastRow && column !== 0 ? BODY_FILLS.first : BODY_FILLS[place];
  if (column === 0) return set.left;
  if (column === 4) return set.right;
  return set.inner;
}

/** 표(hp:tbl) XML. model은 scheduleFormModel()의 결과. */
export function scheduleTableXml(model, { id = 1207592517 } = {}) {
  const rows = model.rows.length ? model.rows : [{ time: '', detail: [''], note: [] }];
  const days = model.rows.length ? model.days : [{ start: 0, span: 1, label: [''] }];
  const places = model.rows.length ? model.places : [{ start: 0, span: 1, text: '' }];
  const heights = rows.map(row => LINE_HEIGHT + EXTRA_LINE * (Math.max(
    lineCount([row.time], 2), lineCount(row.detail, 3), lineCount(row.note, 4)
  ) - 1));
  const spanHeight = (start, span) => heights.slice(start, start + span).reduce((sum, height) => sum + height, 0);
  const last = rows.length - 1;
  // 표의 행 번호: 0은 머리글, 본문 i번째 줄은 i + 1
  const dayAt = new Map(days.map(day => [day.start, day]));
  const placeAt = new Map(places.map(place => [place.start, place]));

  const header = `<hp:tr>${SCHEDULE_FORM_COLUMNS.map((name, col) => cell({
    col, row: 0, height: HEADER_HEIGHT, fill: HEADER_FILLS[col], lines: [name], header: true
  })).join('')}</hp:tr>`;

  const body = rows.map((row, index) => {
    const cells = [];
    const day = dayAt.get(index);
    if (day) {
      cells.push(cell({
        col: 0, row: index + 1, span: day.span, height: spanHeight(day.start, day.span),
        fill: fillFor(0, day.start === 0, day.start + day.span - 1 === last), lines: day.label
      }));
    }
    const place = placeAt.get(index);
    if (place) {
      cells.push(cell({
        col: 1, row: index + 1, span: place.span, height: spanHeight(place.start, place.span),
        fill: fillFor(1, place.start === 0, place.start + place.span - 1 === last), lines: place.text ? place.text.split(/\s*\n\s*/) : []
      }));
    }
    const edge = [index === 0, index === last];
    cells.push(cell({ col: 2, row: index + 1, height: heights[index], fill: fillFor(2, ...edge), lines: [row.time] }));
    cells.push(cell({ col: 3, row: index + 1, height: heights[index], fill: fillFor(3, ...edge), lines: row.detail }));
    cells.push(cell({ col: 4, row: index + 1, height: heights[index], fill: fillFor(4, ...edge), lines: row.note }));
    return `<hp:tr>${cells.join('')}</hp:tr>`;
  }).join('');

  const height = HEADER_HEIGHT + heights.reduce((sum, value) => sum + value, 0);
  return `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length + 1}" colCnt="5" cellSpacing="0" borderFillIDRef="5" noAdjust="0">`
    + `<hp:sz width="${TABLE_WIDTH}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>`
    + '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
    + '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>'
    + header + body
    + '</hp:tbl>';
}

/** 본문(section0.xml): 견본의 앞부분(쪽 설정·제목) + 새 표 + 견본의 뒷부분 */
export function scheduleSectionXml(model, head, tail) {
  return head + scheduleTableXml(model) + tail;
}

/** HWPX 파일 내용(Blob). model은 scheduleFormModel()의 결과. */
export function buildScheduleHwpx(model, { title = '세부 일정표' } = {}) {
  return buildHwpx('schedule-hwpx', {
    tableXml: scheduleTableXml(model),
    previewText: `세부 일정표\n${scheduleFormText(model)}`,
    title
  });
}

export async function downloadScheduleHwpx(model, filename, options) {
  downloadBlob(await buildScheduleHwpx(model, options), filename);
}
