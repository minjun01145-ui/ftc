import { COST_FORM_TITLE, costFormText } from './costForm.js';
import { buildHwpx, downloadBlob, escapeXml } from './hwpxPackage.js';

/**
 * 경비 산출내역을 한글 파일(HWPX)로 만든다. 견본(templates/cost-hwpx)의 글꼴·테두리·글머리표·쪽 테두리를 쓴다.
 * 표는 글자처럼 취급하지 않아 길면 다음 쪽으로 이어지고 머리글 줄이 반복된다.
 */
const WIDTHS = [11635, 36447];
const TABLE_WIDTH = WIDTHS[0] + WIDTHS[1];
const HEADER_HEIGHT = 1325;
const LINE_HEIGHT = 1731;
const EXTRA_LINE = 800;
const CELL_PADDING = 282;
const CHAR_WIDTH = 950;

// header.xml의 테두리 번호: 머리글(음영), 첫 줄, 가운데 줄, 마지막 항목 줄(아래 이중선), 1인당 경비 줄, 안내(※) 줄
const FILLS = {
  header: [6, 8],
  first: [9, 10],
  middle: [11, 12],
  last: [13, 14],
  total: [15, 16],
  notes: 17
};
// 글자 모양(charPr)과 문단 모양(paraPr): 가운데 정렬, 글머리표(•) 목록, 안내 문단
const CHAR = { header: 20, strong: 21, body: 22 };
const PARA = { center: 15, bullet: 16, note: 17 };

function visualWidth(text) {
  return [...String(text)].reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? 0.55 : 1), 0) * CHAR_WIDTH;
}

function lineCount(lines, width, indent = 0) {
  const room = width - CELL_PADDING - indent;
  return Math.max(1, lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(visualWidth(line) / room)), 0));
}

function paragraph(text, para, charPr) {
  const run = text ? `<hp:run charPrIDRef="${charPr}"><hp:t>${escapeXml(text)}</hp:t></hp:run>` : `<hp:run charPrIDRef="${charPr}"/>`;
  return `<hp:p id="2147483648" paraPrIDRef="${para}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${run}</hp:p>`;
}

function cell({ col, row, colSpan = 1, width, height, fill, paragraphs, margin = 141 }) {
  return `<hp:tc name="" header="${row === 0 ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${fill}">`
    + '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
    + paragraphs
    + `</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${colSpan}" rowSpan="1"/>`
    + `<hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="${margin}" right="${margin}" top="141" bottom="141"/></hp:tc>`;
}

const heightFor = lines => LINE_HEIGHT + EXTRA_LINE * (lines - 1);

/** 표(hp:tbl) XML. model은 costFormModel()의 결과. */
export function costTableXml(model, { id = 1207592526 } = {}) {
  const rows = [];
  rows.push([
    cell({ col: 0, row: 0, width: WIDTHS[0], height: HEADER_HEIGHT, fill: FILLS.header[0], paragraphs: paragraph('일자', PARA.center, CHAR.header) }),
    cell({ col: 1, row: 0, width: WIDTHS[1], height: HEADER_HEIGHT, fill: FILLS.header[1], paragraphs: paragraph('경비 산출', PARA.center, CHAR.header) })
  ]);

  const body = model.rows.length ? model.rows : [{ kind: 'date', label: [''], items: ['비용 항목이 없습니다.'] }];
  body.forEach((item, index) => {
    const row = index + 1;
    const place = index === body.length - 1 ? 'last' : (index === 0 ? 'first' : 'middle');
    const height = heightFor(Math.max(lineCount(item.label, WIDTHS[0]), lineCount(item.items, WIDTHS[1], 1600)));
    const labelChar = item.kind === 'date' ? CHAR.strong : CHAR.body;
    rows.push([
      cell({ col: 0, row, width: WIDTHS[0], height, fill: FILLS[place][0], paragraphs: item.label.map(line => paragraph(line, PARA.center, labelChar)).join('') }),
      cell({ col: 1, row, width: WIDTHS[1], height, fill: FILLS[place][1], margin: 510, paragraphs: item.items.map(line => paragraph(line, PARA.bullet, CHAR.body)).join('') })
    ]);
  });

  const totalRow = body.length + 1;
  rows.push([
    cell({ col: 0, row: totalRow, width: WIDTHS[0], height: LINE_HEIGHT, fill: FILLS.total[0], paragraphs: paragraph('1인당 경비', PARA.center, CHAR.strong) }),
    cell({ col: 1, row: totalRow, width: WIDTHS[1], height: LINE_HEIGHT, fill: FILLS.total[1], paragraphs: paragraph(`${Math.round(model.perPerson).toLocaleString('ko-KR')}원`, PARA.center, CHAR.strong) })
  ]);
  if (model.notes.length) {
    rows.push([cell({
      col: 0, row: totalRow + 1, colSpan: 2, width: TABLE_WIDTH, height: heightFor(lineCount(model.notes, TABLE_WIDTH)),
      fill: FILLS.notes, margin: 510, paragraphs: model.notes.map(note => paragraph(note, PARA.note, CHAR.strong)).join('')
    })]);
  }

  const height = rows.reduce((sum, cells) => sum + Number(cells[0].match(/<hp:cellSz width="\d+" height="(\d+)"/)[1]), 0);
  return `<hp:tbl id="${id}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="2" cellSpacing="0" borderFillIDRef="5" noAdjust="0">`
    + `<hp:sz width="${TABLE_WIDTH}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>`
    + '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="CENTER" vertOffset="0" horzOffset="0"/>'
    + '<hp:outMargin left="141" right="141" top="141" bottom="141"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
    + rows.map(cells => `<hp:tr>${cells.join('')}</hp:tr>`).join('')
    + '</hp:tbl>';
}

export function buildCostHwpx(model, { title = COST_FORM_TITLE } = {}) {
  return buildHwpx('cost-hwpx', {
    tableXml: costTableXml(model),
    previewText: `${COST_FORM_TITLE}\n${costFormText(model)}`,
    title
  });
}

export async function downloadCostHwpx(model, filename, options) {
  downloadBlob(await buildCostHwpx(model, options), filename);
}
