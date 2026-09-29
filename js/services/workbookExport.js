import { buildProposalLines, calculateWorkflow, reconcileAdministrativeEntries } from '../workflowEngine.js';
import { FTC_SCHOOL_SCOPE } from '../presets.js';

const xml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const number = value => Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
const money = value => number(value) ?? 0;
const groupLabel = value => ({ vulnerable: '취약 참여', regular: '비취약 참여', vulnerableAbsent: '취약 불참', regularAbsent: '비취약 불참', unclassified: '구분 미입력 비용' })[value] ?? value;

function sumKnown(rows, predicate, property) {
  const selected = rows.filter(predicate);
  if (selected.length === 0 || selected.some(row => row[property] === null || row[property] === undefined)) return null;
  return selected.reduce((sum, row) => sum + money(row[property]), 0);
}

function periodLabel(project) {
  if (!project.startDate && !project.endDate) return '';
  const fmt = value => value ? `${Number(value.slice(5, 7))}.${Number(value.slice(8, 10))}.` : '';
  const start = project.startDate ? `${Number(project.startDate.slice(0, 4))}. ${fmt(project.startDate)}` : '';
  const end = project.endDate ? `${Number(project.endDate.slice(0, 4))}. ${fmt(project.endDate)}` : '';
  return start && end ? `${start}~${end}` : start || end;
}

function confirmedProject(project) {
  const snapshot = project.workflow?.confirmedPlan;
  if (!snapshot) return null;
  return {
    ...project,
    grade: snapshot.grade,
    executionMode: snapshot.business?.executionMode ?? project.executionMode,
    startDate: snapshot.business?.startDate ?? project.startDate,
    endDate: snapshot.business?.endDate ?? project.endDate,
    place: snapshot.business?.place ?? project.place,
    days: snapshot.business?.days ?? project.days,
    expenses: snapshot.expenses ?? project.expenses,
    staffExpenses: snapshot.staffExpenses ?? project.staffExpenses,
    workflow: {
      ...project.workflow,
      attendance: snapshot.attendance ?? project.workflow?.attendance,
      resources: snapshot.resources ?? project.workflow?.resources,
      manualAllocations: snapshot.manualAllocations ?? project.workflow?.manualAllocations,
      proposalReference: snapshot.proposalReference ?? project.workflow?.proposalReference
    }
  };
}

function schoolForConfirmedPlan(project, school) {
  const snapshot = project.workflow?.confirmedPlan;
  if (!snapshot?.schoolBudget) return school;
  return {
    ...school,
    projectBudgets: { ...(school.projectBudgets ?? {}), [project.id]: snapshot.schoolBudget }
  };
}

function projectSettlement(project, school) {
  const plan = confirmedProject(project) ?? project;
  const legacySchoolBudget = project.workflow?.confirmedPlan?.schoolBudget?.amount;
  const expected = calculateWorkflow(
    plan,
    plan === project ? school : schoolForConfirmedPlan(project, school),
    { useLegacySnapshotSchoolBudget: plan !== project && legacySchoolBudget != null }
  );
  const actual = calculateWorkflow(project, school, { basis: 'actual' });
  const sourceRows = actual.resourceTotals;
  const educationIssued = sumKnown(sourceRows, row => row.reportClass === 'education', 'issuedAmount');
  const regularParticipants = actual.attendance.regularParticipants;
  const vulnerableParticipants = actual.attendance.vulnerableParticipants;
  const participantCost = actual.rows.reduce((sum, row) => sum
    + row.groups.regular.cost + row.groups.vulnerable.cost, 0);
  const actualComplete = !actual.missingActual;
  const actualSourceAmount = reportClass => actualComplete ? sourceRows
    .filter(row => row.reportClass === reportClass).reduce((sum, row) => sum + row.used, 0) : null;
  const schoolBudget = school.projectBudgets?.[project.id];
  return {
    project: plan,
    liveProject: project,
    expected,
    actual,
    actualComplete,
    grade: plan.grade,
    schoolLevel: FTC_SCHOOL_SCOPE.schoolLevel,
    establishment: FTC_SCHOOL_SCOPE.establishment,
    schoolName: school.name ?? '',
    executionMode: plan.executionMode ?? '',
    period: periodLabel(plan),
    days: number(plan.days),
    place: plan.place ?? '',
    enrolled: actualComplete ? actual.attendance.enrolled : null,
    regularParticipants: actualComplete ? regularParticipants : null,
    vulnerableParticipants: actualComplete ? vulnerableParticipants : null,
    participants: actualComplete ? actual.attendance.participants : null,
    averageParticipantCost: actualComplete && actual.attendance.participants > 0
      ? Math.round(participantCost / actual.attendance.participants) : null,
    educationIssued,
    educationUsed: actualSourceAmount('education'),
    educationBalance: actualComplete && educationIssued !== null
      ? educationIssued - actualSourceAmount('education') : null,
    schoolUsed: actualSourceAmount('school'),
    studentUsed: actualComplete ? actual.studentUsed : null,
    externalUsed: actualSourceAmount('external'),
    fixedAbsenceCost: actualComplete ? actual.rows.reduce((sum, row) => sum
      + row.groups.vulnerableAbsent.cost + row.groups.regularAbsent.cost + row.groups.unclassified.cost, 0) : null,
    schoolBudget: schoolBudget?.amount ?? null,
    notes: actualComplete ? [
      actual.attendance.fixedCostAbsent ? `고정비 부담 불참 ${actual.attendance.fixedCostAbsent}명` : '',
      `참여 인원 기준 평균 ${number(participantCost / Math.max(1, actual.attendance.participants))}원`,
      project.workflow?.confirmedPlan ? `품의 계획 ${project.workflow.confirmedPlan.revision ?? 1}차 확정` : '품의 확정 계획 없음'
    ].filter(Boolean).join('\n') : `정산 미완료: ${actual.missingAttendance.length}개 인원 항목, ${actual.missingExpenseIds.length + actual.missingStaffExpenseIds.length}개 비용 항목 미입력`
  };
}

function cell(value, style = 2, formula = null) {
  return { value, style, formula };
}

function columnName(n) {
  let result = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    result = String.fromCharCode(65 + r) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function cellXml(address, value, style = 2, formula = null) {
  if (value === null || value === undefined || value === '') return '';
  if (formula) return `<c r="${address}" s="${style}"><f>${xml(formula)}</f><v>${xml(value)}</v></c>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function sheetXml(matrix, { merges = [], widths = [], landscape = true, printArea = null, repeatRows = null, frozenRows = 1 } = {}) {
  const rowCount = Math.max(1, matrix.length);
  const maxCols = Math.max(1, ...matrix.map(row => row.length));
  const rows = matrix.map((row, index) => {
    const cells = row.map((item, colIndex) => {
      const data = item && typeof item === 'object' && ('value' in item || 'formula' in item)
        ? item : cell(item, typeof item === 'number' ? 3 : 2);
      return cellXml(`${columnName(colIndex + 1)}${index + 1}`, data.value, data.style ?? 2, data.formula);
    }).join('');
    return `<row r="${index + 1}"${index === 0 ? ' ht="30" customHeight="1"' : ''}>${cells}</row>`;
  }).join('');
  const colXml = widths.length ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>` : '';
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map(range => `<mergeCell ref="${range}"/>`).join('')}</mergeCells>` : '';
  const maxRef = `${columnName(maxCols)}${rowCount}`;
  const printSettings = `<pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="${landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`;
  const pane = frozenRows > 0
    ? `<pane ySplit="${frozenRows}" topLeftCell="A${frozenRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const autoFilter = null;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheetPr><pageSetUpPr fitToPage="1" autoPageBreaks="0"/></sheetPr><dimension ref="A1:${maxRef}"/>`
    + `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>${colXml}`
    + `<sheetData>${rows}</sheetData>${mergeXml}${autoFilter ?? ''}${printSettings}`
    + `</worksheet>`;
}

const officialMerges = [
  'B4:B6', 'C4:C6', 'D4:D6', 'E4:N4', 'E5:E6', 'F5:F6', 'G5:H6', 'I5:I6', 'J5:J6', 'K5:K6',
  'L5:N5', 'O4:P6', 'Q4:X4', 'Q5:S5', 'T5:W5', 'X5:X6'
];

function officialSheet(summaries, schoolYear) {
  const headerRows = Array.from({ length: 6 }, () => []);
  const put = (row, col, value, style = 1) => { headerRows[row - 1][col - 1] = cell(value, style); };
  put(2, 2, `■ ${schoolYear ?? ''}학년도 현장체험학습비 지원금 정산`, 1);
  put(3, 24, '(단위: 명, 원)', 2);
  put(4, 2, '학교명\n(기관명)'); put(4, 3, '급별\n(초/중/고)'); put(4, 4, '설립별\n(공립/사립)');
  put(4, 5, '실시 현황'); put(4, 15, '1인당 현장체험학습비\n(단위: 원)'); put(4, 17, '현장체험학습비 지원금 집행내역 정산');
  put(5, 5, '대상학년\n(학년별 행작성)'); put(5, 6, '추진방식\n(숙박형/일일형/혼합형)'); put(5, 7, '기간'); put(5, 9, '일수'); put(5, 10, '장소'); put(5, 11, '해당학년 총 학생수');
  put(5, 12, '참여인원'); put(5, 17, '현장체험학습비 지원금'); put(5, 20, '현장체험학습비 지원금 외 부담액'); put(5, 24, '비고');
  put(6, 12, '비취약 참여인원'); put(6, 13, '취약 참여인원 (A)'); put(6, 14, '계'); put(6, 17, '교부액'); put(6, 18, '집행액'); put(6, 19, '잔액 (원단위)'); put(6, 20, '학교부담'); put(6, 21, '학생부담'); put(6, 22, '외부지원'); put(6, 23, '소계');
  const matrix = headerRows;
  for (let index = 0; index < summaries.length; index++) {
    const item = summaries[index];
    const rowIndex = index + 7;
    const row = Array.from({ length: 24 }, () => null);
    row[1] = cell(item.schoolName, 2);
    row[2] = cell(item.schoolLevel, 2);
    row[3] = cell(item.establishment, 2);
    row[4] = cell(item.grade === '' || item.grade == null ? '' : Number(item.grade), 3);
    row[5] = cell(item.executionMode, 2);
    row[6] = cell(item.period, 2);
    row[8] = cell(item.days, 3);
    row[9] = cell(item.place, 2);
    row[10] = cell(item.enrolled, 3);
    row[11] = cell(item.regularParticipants, 3);
    row[12] = cell(item.vulnerableParticipants, 3);
    row[13] = cell(item.participants, 3, `L${rowIndex}+M${rowIndex}`);
    row[14] = cell(item.averageParticipantCost, 3);
    row[16] = cell(item.educationIssued, 3);
    row[17] = cell(item.educationUsed, 3);
    row[18] = cell(item.educationBalance, 3, item.educationIssued != null && item.educationUsed != null ? `Q${rowIndex}-R${rowIndex}` : null);
    row[19] = cell(item.schoolUsed, 3);
    row[20] = cell(item.studentUsed, 3);
    row[21] = cell(item.externalUsed, 3);
    const outside = item.schoolUsed == null || item.studentUsed == null || item.externalUsed == null
      ? null : item.schoolUsed + item.studentUsed + item.externalUsed;
    row[22] = cell(outside, 3, outside == null ? null : `T${rowIndex}+U${rowIndex}+V${rowIndex}`);
    row[23] = cell(item.notes, 2);
    matrix.push(row);
  }
  const merges = [...officialMerges];
  for (let row = 7; row < 7 + summaries.length; row++) {
    merges.push(`G${row}:H${row}`, `O${row}:P${row}`);
  }
  return {
    xml: sheetXml(matrix, { merges, landscape: true, widths: [3, 22, 10, 11, 10, 15, 17, 3, 7, 18, 13, 12, 12, 10, 14, 3, 14, 14, 14, 14, 14, 14, 14, 34], frozenRows: 6 }),
    printArea: `'정산 제출'!$B$2:$X$${Math.max(7, 6 + summaries.length)}`,
    repeatRows: `'정산 제출'!$4:$6`
  };
}

function genericSheet(title, headers, body, widths = []) {
  const matrix = [[cell(title, 4)], headers.map(label => cell(label, 1)), ...body.map(row => row.map(value => {
    if (value && typeof value === 'object' && ('value' in value || 'formula' in value)) return value;
    return cell(value, typeof value === 'number' ? 3 : 2);
  }))];
  return sheetXml(matrix, { widths, landscape: true, frozenRows: 2 });
}

function detailSheet(projects, school) {
  const body = [];
  const summaries = projects.map(project => projectSettlement(project, school));
  for (const item of summaries) {
    body.push([
      item.grade ? `${item.grade}학년` : '학년 미지정', item.project.title, '계획/정산 요약',
      item.actualComplete ? item.actual.participants : '실적 인원 미입력', item.expected.studentCost,
      item.actualComplete ? item.actual.studentCost : '실적 비용 미입력',
      item.actualComplete ? item.actual.studentUsed : '미입력',
      item.actualComplete ? item.actual.staffTotal : '미입력',
      item.actualComplete ? item.actual.operationTotal : '미입력',
      item.actualComplete ? item.actual.eventTotal : '미입력'
    ]);
    const confirmed = item.liveProject.workflow?.confirmedPlan;
    const proposal = confirmed?.proposalLines ?? buildProposalLines(item.expected, item.project);
    for (const line of proposal) body.push([
      item.grade ? `${item.grade}학년` : '학년 미지정', item.project.title,
      `${line.date || ''} ${line.name}`, `${groupLabel(line.group)} · ${line.source}`,
      line.quantity, line.unitAmount, line.amount, line.calculation, line.note, ''
    ]);
    const reference = item.project.workflow?.proposalReference ?? {};
    const people = item.expected.attendance.participants;
    const participantCost = item.expected.rows.reduce((sum, row) => sum
      + row.groups.regular.cost + row.groups.vulnerable.cost, 0);
    const currentPerPerson = people > 0 ? Math.round(participantCost / people) : null;
    const referenceValues = [
      ['제안서 본문 1인당', reference.bodyPerPerson],
      ['제안서 표 1인당 합계', reference.tablePerPerson],
      ['제안서 세부항목 1인당 합계', reference.itemizedPerPerson]
    ];
    for (const [label, noted] of referenceValues) if (noted != null) body.push([
      item.grade ? `${item.grade}학년` : '학년 미지정', item.project.title, label,
      reference.documentLabel || '문서 참고값', 1, noted, noted,
      currentPerPerson == null ? '참여 인원 미입력' : `현재 ${currentPerPerson.toLocaleString()}원`,
      currentPerPerson == null ? '' : `차이 ${(noted - currentPerPerson).toLocaleString()}원`, ''
    ]);
    const vehicleValues = [reference.vehicleContractAmount, reference.vehicleMultiplier, reference.vehicleDenominator, reference.vehicleQuotedUnit];
    if (vehicleValues.every(value => value != null) && number(reference.vehicleDenominator) > 0) {
      const calculated = Math.round(number(reference.vehicleContractAmount) * number(reference.vehicleMultiplier) / number(reference.vehicleDenominator));
      body.push([item.grade ? `${item.grade}학년` : '학년 미지정', item.project.title, '제안서 차량 산식',
        `${number(reference.vehicleContractAmount).toLocaleString()} × ${number(reference.vehicleMultiplier)} ÷ ${number(reference.vehicleDenominator)}`,
        number(reference.vehicleDenominator), number(reference.vehicleQuotedUnit), number(reference.vehicleQuotedUnit),
        `계산 ${calculated.toLocaleString()}원`, `차이 ${(number(reference.vehicleQuotedUnit) - calculated).toLocaleString()}원`, '']);
    }
    const reconciled = reconcileAdministrativeEntries(item.liveProject,
      confirmed ? { rows: (confirmed.calculations.allocations ?? []).map(row => ({ id: row.id, name: row.name, studentCost: row.studentCost, contractAmount: row.contractAmount })) } : item.expected,
      item.actual);
    for (const row of reconciled.returnRows) body.push([
      item.grade ? `${item.grade}학년` : '학년 미지정', item.project.title, `반납 대조 · ${row.name}`,
      row.status, '', row.expectedReturn, row.returned, '행정실 환불 거래', row.difference, row.status
    ]);
    body.push(['', '', '', '', '', '', '', '', '', '']);
  }
  return genericSheet('비용·재원별 검토 자료', ['학년', '사업', '항목/구분', '대상/재원', '인원/수량', '단가/계획 학생경비', '금액', '산식/인솔자 경비', '비고/운영경비', '행사 전체'], body, [12, 32, 28, 26, 12, 18, 20, 27, 34, 20]);
}

function adminSheet(projects, school) {
  const body = [];
  for (const project of projects) {
    const plan = project.workflow?.confirmedPlan
      ? { rows: (project.workflow.confirmedPlan.calculations.allocations ?? []).map(row => ({ id: row.id, name: row.name, studentCost: row.studentCost, contractAmount: row.contractAmount })) }
      : calculateWorkflow(project, school);
    const actual = calculateWorkflow(project, school, { basis: 'actual' });
    const reconciled = reconcileAdministrativeEntries(project, plan, actual);
    for (const row of reconciled.rows) body.push([
      project.grade ? `${project.grade}학년` : '학년 미지정', project.title, row.name,
      row.planned, row.committed, row.commitmentDifference, row.grossPayments,
      row.refunds, row.netPayments, row.actual, row.paymentDifference, row.status
    ]);
    for (const row of reconciled.returnRows) body.push([
      project.grade ? `${project.grade}학년` : '학년 미지정', project.title, `지원금 반납 · ${row.name}`,
      row.expectedReturn, row.returned, row.difference, '', '', row.returned, row.expectedReturn,
      row.difference, row.status
    ]);
    for (const entry of reconciled.orphanEntries) body.push([
      project.grade ? `${project.grade}학년` : '학년 미지정', project.title, `연결 비용 없음 · ${entry.document || entry.vendor}`,
      '', '', '', '', '', '', '', '', '미대조'
    ]);
  }
  return genericSheet('행정실 원인행위·지급 대조', ['학년', '사업', '항목', '확정 품의액', '원인행위액', '원인행위 차액', '지급 총액', '환불액', '순지급액', 'FTC 실적 순집행', '지급 차액', '대조 상태'], body, [12, 30, 24, 17, 17, 17, 17, 15, 17, 19, 16, 16]);
}

function schoolSheet(projects, school) {
  const rows = projects.map(project => {
    const item = projectSettlement(project, school);
    const budget = school.projectBudgets?.[project.id];
    return [
      project.grade ? `${project.grade}학년` : '학년 미지정', project.title,
      item.actualComplete ? item.actual.regularBurden : '실적 미입력',
      budget?.amount ?? '미배정', budget?.fixed ? '고정' : '조정 가능',
      item.actualComplete ? item.actual.studentUsed : '실적 미입력',
      item.actualComplete ? item.actual.studentCost : '실적 미입력'
    ];
  });
  const totals = projects.map(project => projectSettlement(project, school));
  const complete = totals.every(item => item.actualComplete);
  rows.push([
    '학교 전체', '', '', totals.reduce((sum, item) => sum + money(school.projectBudgets?.[item.liveProject.id]?.amount), 0), '',
    complete ? totals.reduce((sum, item) => sum + money(item.actual.studentUsed), 0) : '실적 미완료',
    complete ? totals.reduce((sum, item) => sum + money(item.actual.studentCost), 0) : '실적 미완료'
  ]);
  return genericSheet('학년별 학교 예산·부담 비교', ['학년', '사업', '비취약 1인 부담', '학교 예산 배정', '배정 상태', '학교 지원 집행', '학생경비'], rows, [16, 34, 20, 20, 16, 20, 20]);
}

function workbookStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0;[Red]-#,##0"/></numFmts>`
    + `<fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/><family val="2"/></font><font><b/><sz val="12"/><name val="맑은 고딕"/><family val="2"/></font></fonts>`
    + `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF5"/><bgColor indexed="64"/></patternFill></fill></fills>`
    + `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF8D98A5"/></left><right style="thin"><color rgb="FF8D98A5"/></right><top style="thin"><color rgb="FF8D98A5"/></top><bottom style="thin"><color rgb="FF8D98A5"/></bottom><diagonal/></border></borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = encoder.encode(name);
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + filename.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint32(14, crc, true); local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true); local.setUint16(26, filename.length, true);
    localHeader.set(filename, 30);
    localParts.push(localHeader, data);
    const centralHeader = new Uint8Array(46 + filename.length);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true); central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true); central.setUint16(10, 0, true); central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true); central.setUint32(24, data.length, true);
    central.setUint16(28, filename.length, true); central.setUint32(42, offset, true);
    centralHeader.set(filename, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralParts.length, true); endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true);
  const totalLength = offset + centralSize + end.length;
  const output = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, end]) { output.set(part, cursor); cursor += part.length; }
  return output;
}

function workbookXml(sheetNames, definedNames) {
  const names = sheetNames.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const definitions = definedNames.length ? `<definedNames>${definedNames.map(item => `<definedName name="${item.name}" localSheetId="${item.sheetId}">${xml(item.value)}</definedName>`).join('')}</definedNames>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names}</sheets>${definitions}<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`;
}

export function buildWorkflowWorkbook(projects, school) {
  const summaries = [...projects].sort((a, b) => Number(a.grade || 99) - Number(b.grade || 99)).map(project => projectSettlement(project, school));
  const official = officialSheet(summaries, school.schoolYear);
  const sheetNames = ['정산 제출', '비용·재원 상세', '행정실 대조', '학교 전체'];
  const sheets = [official.xml, detailSheet(projects, school), adminSheet(projects, school), schoolSheet(projects, school)];
  const definedNames = [
    { name: '_xlnm.Print_Area', sheetId: 0, value: official.printArea },
    { name: '_xlnm.Print_Titles', sheetId: 0, value: official.repeatRows }
  ];
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': workbookXml(sheetNames, definedNames),
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': workbookStyles()
  };
  sheets.forEach((xmlText, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = xmlText; });
  return zipStore(files);
}

export function downloadWorkflowWorkbook(projects, school) {
  const bytes = buildWorkflowWorkbook(projects, school);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const schoolName = String(school.name || '학교').replace(/[\\/:*?"<>|]/g, '_');
  anchor.download = `${schoolName}_${school.schoolYear}_현장체험학습_정산검토.xlsx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return bytes.length;
}
