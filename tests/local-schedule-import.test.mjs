import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DocumentReadError } from '../js/documents/documentReadError.js';
import { parseScheduleFromLayout, parseScheduleFromTables } from '../js/scheduleImport/scheduleDocumentParser.js';
import { detectYear, parseMonthDay, parseTimeRange, scheduleTitle } from '../js/scheduleImport/scheduleText.js';
import { createLocalScheduleImportService } from '../js/services/localScheduleImport.js';

// 학교운영위원회 안건 제안서(2026학년도 2학년 현장체험학습 실시 계획) PDF의 글자 위치
const { pages } = JSON.parse(readFileSync(new URL('./fixtures/committee-proposal-layout.json', import.meta.url), 'utf8'));
const summary = items => items.map(item => [item.date, item.arrivalTime, item.departureTime, item.name]);

test('시간·날짜·일차 표기를 읽는다', () => {
  assert.deepEqual(parseTimeRange('12:00 ~ 20:30'), { start: '12:00', end: '20:30' });
  assert.deepEqual(parseTimeRange('06:30 ~'), { start: '06:30', end: '' });
  assert.deepEqual(parseTimeRange('~ 18:30'), { start: '', end: '18:30' });
  assert.deepEqual(parseTimeRange('9:05'), { start: '09:05', end: '' });
  assert.equal(parseTimeRange('중식'), null);
  assert.deepEqual(parseMonthDay('5월13일(수)'), { month: 5, day: 13 });
  assert.deepEqual(parseMonthDay('5. 14.(목)'), { month: 5, day: 14 });
  assert.equal(detectYear(['기간: 2026년 5월 13일(수)'], 2025), 2026);
  assert.equal(detectYear(['기간: 5월 13일'], 2027), 2027);
  assert.equal(scheduleTitle('중식', '중식: 덕평휴게소'), '중식(덕평휴게소)');
});

test('운영위원회 안건 PDF의 세부 일정 표를 AI 없이 그대로 복원한다', () => {
  const { items, source } = parseScheduleFromLayout(pages, { fallbackYear: 2025 });
  assert.equal(source, 'detailedTable');
  assert.deepEqual(summary(items), [
    ['2026-05-13', '06:30', '', '학교 정문 앞 출발'],
    ['2026-05-13', '12:00', '20:30', '롯데월드 체험 (야간관람 포함)'],
    ['2026-05-13', '21:00', '', '숙소 도착 (서울올림픽파크텔)'],
    ['2026-05-14', '07:00', '08:30', '조식 후 숙소 출발'],
    ['2026-05-14', '09:30', '11:00', '공연 관람'],
    ['2026-05-14', '12:00', '13:00', '서울 통인 시장 투어 (중식 포함)'],
    ['2026-05-14', '14:00', '15:00', '국립 현대 미술관 관람'],
    ['2026-05-14', '15:30', '17:00', '인사동 문화의 거리 투어'],
    ['2026-05-14', '18:30', '20:00', '숙소 도착 후 석식 (서울올림픽파크텔)'],
    ['2026-05-15', '07:00', '08:30', '조식 후 숙소 출발'],
    ['2026-05-15', '09:30', '11:00', '경복궁 관람 후 서울 출발'],
    ['2026-05-15', '12:30', '13:30', '중식(덕평휴게소)'],
    ['2026-05-15', '', '18:30', '부산 도착 및 해산']
  ]);
  assert.equal(items[1].contact, '중식, 석식 롯데월드 식당 쿠폰', '비고는 메모(비고)로 들어간다');
  assert.deepEqual(items.map(item => item.place), [
    '부산', '잠실 롯데월드', '잠실 롯데월드',
    '서울', '서울', '서울', '서울', '서울', '서울',
    '서울', '서울', '서울', '부산'
  ], '병합한 장소 칸은 가운데 높이로 행 묶음을 찾는다');
});

test('세부 일정 표가 없으면 주요 경로(➡)를 일정으로 읽는다(한 날이 두 줄이어도 같은 날짜)', () => {
  const { items, source } = parseScheduleFromLayout([pages[0]], {});
  assert.equal(source, 'routeSummary');
  assert.deepEqual(items.map(item => [item.date, item.name]), [
    ['2026-05-13', '학교 출발'], ['2026-05-13', '잠실 롯데월드(중식, 석식, 야간관람)'], ['2026-05-13', '서울올림픽파크텔(숙박)'],
    ['2026-05-14', '숙소 출발'], ['2026-05-14', '공연 관람'], ['2026-05-14', '서울 통인 시장(중식, 자유 일정)'],
    ['2026-05-14', '국립 현대 미술관'], ['2026-05-14', '인사동 문화 마을(자유 일정)'], ['2026-05-14', '서울올림픽파크텔(숙박)'],
    ['2026-05-15', '숙소 출발'], ['2026-05-15', '경복궁'], ['2026-05-15', '덕평휴게소(중식)'], ['2026-05-15', '학교 도착']
  ]);
});

test('일자 칸에 "n일차"만 있어도 날짜가 있는 날을 기준으로 나머지 날짜를 채운다', () => {
  const layout = [{
    pageNumber: 1,
    items: [
      { text: '일자', x: 60, y: 700 }, { text: '시간', x: 190, y: 700 }, { text: '일정', x: 300, y: 700 },
      { text: '1일차', x: 55, y: 660 }, { text: '5월 13일', x: 55, y: 648 },
      { text: '09:00 ~ 10:00', x: 180, y: 660 }, { text: '박물관', x: 300, y: 660 },
      { text: '13:00 ~ 15:00', x: 180, y: 630 }, { text: '과학관', x: 300, y: 630 },
      { text: '2일차', x: 55, y: 590 },
      { text: '08:00 ~ 09:00', x: 180, y: 590 }, { text: '조식', x: 300, y: 590 },
      { text: '10:00 ~ 12:00', x: 180, y: 560 }, { text: '궁궐 관람', x: 300, y: 560 }
    ]
  }];
  const { items } = parseScheduleFromLayout(layout, { fallbackYear: 2026 });
  assert.deepEqual(items.map(item => [item.date, item.name]), [
    ['2026-05-13', '박물관'], ['2026-05-13', '과학관'], ['2026-05-14', '조식'], ['2026-05-14', '궁궐 관람']
  ]);
});

test('HWPX 표(셀 열 번호)에서 병합된 일자 칸과 시간 순서로 날짜를 나눈다', () => {
  const row = (...cells) => ({ cells: cells.map(([col, text]) => ({ col, text })) });
  const table = [
    row([0, '일 자'], [1, '시간'], [2, '상세일정'], [3, '비고']),
    row([0, '제1일차\n5월13일(수)'], [1, '06:30 ~'], [2, '학교 출발']),
    row([1, '12:00 ~ 20:30'], [2, '롯데월드 체험'], [3, '중식, 석식']),
    row([0, '제2일차\n5월14일(목)'], [1, '07:00 ~ 08:30'], [2, '조식 후 숙소 출발'], [3, '조식: 숙소식']),
    row([1, '12:30 ~ 13:30'], [2, '중식'], [3, '중식: 통인시장'])
  ];
  const { items, source } = parseScheduleFromTables({ tables: [[row([0, '제목'])], table], paragraphs: ['기간: 2026년 5월 13일 ~ 5월 14일'] });
  assert.equal(source, 'detailedTable');
  assert.deepEqual(summary(items), [
    ['2026-05-13', '06:30', '', '학교 출발'],
    ['2026-05-13', '12:00', '20:30', '롯데월드 체험'],
    ['2026-05-14', '07:00', '08:30', '조식 후 숙소 출발'],
    ['2026-05-14', '12:30', '13:30', '중식(통인시장)']
  ]);
});

test('HWPX 문단의 주요 경로도 읽는다', () => {
  const { items } = parseScheduleFromTables({
    tables: [],
    paragraphs: ['2026년 현장체험학습', '5월 13일(수) 학교 출발 ➡ 롯데월드 ➡ 숙소', '5월 14일(목) 숙소 출발 → 경복궁']
  });
  assert.deepEqual(items.map(item => [item.date, item.name]), [
    ['2026-05-13', '학교 출발'], ['2026-05-13', '롯데월드'], ['2026-05-13', '숙소'],
    ['2026-05-14', '숙소 출발'], ['2026-05-14', '경복궁']
  ]);
});

test('가져오기 서비스: PDF/HWPX를 알맞은 방법으로 읽고, 못 찾거나 못 읽으면 알려 준다', async () => {
  const pdf = { name: '안건.pdf', type: 'application/pdf', size: 1000 };
  const hwpx = { name: '계획.hwpx', type: '', size: 1000 };
  const service = createLocalScheduleImportService({
    readPdf: async () => pages,
    readHwpx: async () => ({ tables: [], paragraphs: ['5월 13일 학교 ➡ 박물관'] })
  });
  assert.equal((await service.importFile(pdf, { schoolYear: 2026 })).length, 13);
  assert.equal((await service.importFile(hwpx, { schoolYear: 2026 }))[1].name, '박물관');

  const empty = createLocalScheduleImportService({ readPdf: async () => [{ pageNumber: 1, items: [{ text: '안내문', x: 0, y: 0 }] }] });
  await assert.rejects(empty.importFile(pdf), error => error.code === 'SCHEDULE_NOT_FOUND');

  const broken = createLocalScheduleImportService({ readPdf: async () => { throw new DocumentReadError('암호', { code: 'DOCUMENT_ENCRYPTED' }); } });
  await assert.rejects(broken.importFile(pdf), error => error.code === 'DOCUMENT_ENCRYPTED' && error.name === 'ScheduleDocumentImportError');
});

test('일자 칸이 "5/13(수)" 형식이고 문서에 연도가 없으면 기본정보 학년도로 날짜를 채운다', () => {
  const row = (...cells) => ({ cells: cells.map(([col, text]) => ({ col, text })) });
  const table = [
    row([0, '일 자'], [1, '장소'], [2, '시간'], [3, '상세일정'], [4, '비고']),
    row([0, '제1일차\n5/13(수)'], [1, '부산'], [2, '06:10~06:30'], [3, '학교 정문 앞'], [4, '음주측정']),
    row([2, '06:30~08:30'], [3, '이동'], [4, '']),
    row([1, '잠실\n롯데월드'], [2, '12:10~20:30'], [3, '롯데월드 체험\n(야간관람 포함)'], [4, '중식, 석식\n롯데월드\n식당 쿠폰']),
    row([1, '숙소'], [2, '22:00'], [3, '점호 및 취침 준비'], [4, '']),
    row([0, '제2일차\n5/14(목)'], [1, '서울'], [2, '07:00~08:30'], [3, '기상(06:00), 조식 후 숙소 출발'], [4, '조식: 숙소식']),
    row([0, '제3일차\n5/15(금)'], [1, '서울'], [2, '12:30~13:30'], [3, '중식(덕평휴게소)'], [4, '중식: 현지식']),
    row([2, '18:30'], [3, '부산 도착 및 해산'], [4, ''])
  ];
  const { items } = parseScheduleFromTables(
    { tables: [table], paragraphs: ['2학년 수학여행 프로그램 세부 일정', '※ 세부일정은 현지 상황으로 일부 조정될 수 있음.'] },
    { fallbackYear: 2026 }
  );
  assert.deepEqual(summary(items), [
    ['2026-05-13', '06:10', '06:30', '학교 정문 앞'],
    ['2026-05-13', '06:30', '08:30', '이동'],
    ['2026-05-13', '12:10', '20:30', '롯데월드 체험 (야간관람 포함)'],
    ['2026-05-13', '22:00', '', '점호 및 취침 준비'],
    ['2026-05-14', '07:00', '08:30', '기상(06:00), 조식 후 숙소 출발'],
    ['2026-05-15', '12:30', '13:30', '중식(덕평휴게소)'],
    ['2026-05-15', '18:30', '', '부산 도착 및 해산']
  ]);
  assert.deepEqual(items.map(item => item.place), ['부산', '부산', '잠실 롯데월드', '숙소', '서울', '서울', '서울'],
    '병합한 장소 칸은 다음 장소 칸 전까지 같은 장소다');
});

test('빗금 날짜는 날짜처럼 생긴 것만 읽는다', () => {
  assert.deepEqual(parseMonthDay('5/13(수)'), { month: 5, day: 13 });
  assert.deepEqual(parseMonthDay('제2일차 5/14'), { month: 5, day: 14 });
  assert.equal(parseMonthDay('13/40'), null);
  assert.equal(parseMonthDay('2026/05/13'), null);
});
