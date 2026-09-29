import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleFormHtml, scheduleFormModel, scheduleFormText } from '../js/forms/scheduleForm.js';
import { scheduleTableXml } from '../js/forms/scheduleHwpx.js';
import { createProject } from '../js/presets.js';

function project() {
  const p = createProject('2학년 수학여행');
  const item = (date, place, arrivalTime, departureTime, name, contact = '') => ({ id: `${date}-${arrivalTime}`, date, place, arrivalTime, departureTime, name, address: '', contact });
  p.tripSchedule.items = [
    item('2026-05-13', '부산', '06:10', '06:30', '주례 출발', '음주측정'),
    item('2026-05-13', '부산', '06:30', '08:30', '이동'),
    item('2026-05-13', '잠실 롯데월드', '12:10', '20:30', '롯데월드 체험 (야간관람 포함)', '중식, 석식\n롯데월드 식당 쿠폰'),
    item('2026-05-13', '숙소', '22:00', '', '점호 및 취침 준비'),
    item('2026-05-14', '서울', '07:00', '08:30', '기상, 조식 후 숙소 출발', '조식: 숙소식'),
    item('2026-05-14', '서울', '10:00', '11:30', '댄스뮤지컬 관람'),
    item('2026-05-15', '부산', '', '18:30', '부산 도착 및 해산')
  ];
  return p;
}

test('세부 일정표는 날짜와 이어지는 같은 장소를 병합하고, 시간·상세일정·비고를 한 줄씩 둔다', () => {
  const model = scheduleFormModel(project());
  assert.deepEqual(model.days.map(day => [day.start, day.span, day.label]), [
    [0, 4, ['제1일차', '5/13(수)']], [4, 2, ['제2일차', '5/14(목)']], [6, 1, ['제3일차', '5/15(금)']]
  ]);
  assert.deepEqual(model.places.map(place => [place.start, place.span, place.text]), [
    [0, 2, '부산'], [2, 1, '잠실 롯데월드'], [3, 1, '숙소'], [4, 2, '서울'], [6, 1, '부산']
  ], '날이 바뀌면 같은 장소라도 새로 시작한다');
  assert.deepEqual(model.rows.map(row => row.time), ['06:10~06:30', '06:30~08:30', '12:10~20:30', '22:00', '07:00~08:30', '10:00~11:30', '18:30']);
  assert.deepEqual(model.rows[2].detail, ['롯데월드 체험', '(야간관람 포함)']);
  assert.deepEqual(model.rows[2].note, ['중식, 석식', '롯데월드 식당 쿠폰']);

  const html = scheduleFormHtml(model);
  assert.match(html, /<td rowspan="4"[^>]*>제1일차<br>5\/13\(수\)<\/td>/);
  assert.match(html, /background:#BFBFBF/);
  assert.match(scheduleFormText(model), /^일 자\t장소\t시간\t상세일정\t비고\n제1일차 5\/13\(수\)\t부산\t06:10~06:30\t주례 출발\t음주측정/);
});

test('HWPX 표는 견본과 같은 열 너비·테두리를 쓰고 병합 칸의 높이를 행 높이의 합으로 둔다', () => {
  const xml = scheduleTableXml(scheduleFormModel(project()));
  assert.match(xml, /rowCnt="8" colCnt="5"/);
  assert.equal((xml.match(/<hp:tr>/g) ?? []).length, 8);
  assert.match(xml, /<hp:cellAddr colAddr="0" rowAddr="1"\/><hp:cellSpan colSpan="1" rowSpan="4"\/>/);
  assert.match(xml, /<hp:t>제1일차<\/hp:t>.*<hp:t>5\/13\(수\)<\/hp:t>/);
  // 머리글: 회색 음영(borderFill 6~9), 첫 본문 행: 이중선(10~12), 마지막 행: 굵은 선(25, 30, 31)
  assert.match(xml, /borderFillIDRef="6">.*?<hp:t>일 자<\/hp:t>/);
  assert.match(xml, /borderFillIDRef="31">(?:(?!<hp:tc ).)*<hp:cellAddr colAddr="4" rowAddr="7"/);
  assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|quot;)/);
  const cellRows = [...xml.matchAll(/rowAddr="(\d+)"\/><hp:cellSpan colSpan="1" rowSpan="(\d+)"/g)];
  const covered = new Set();
  for (const [, row, span] of cellRows) for (let r = Number(row); r < Number(row) + Number(span); r += 1) covered.add(r);
  assert.equal(covered.size, 8);
});

test('일정이 없으면 빈 줄 하나짜리 표를 만든다', () => {
  const xml = scheduleTableXml(scheduleFormModel(createProject()));
  assert.match(xml, /rowCnt="2"/);
});

test('경비 산출내역은 날짜별 항목, 기타비, 1인당 경비, 지원·부담 안내를 담고 HWPX 표로 만든다', async () => {
  const { costFormModel, costFormHtml } = await import('../js/forms/costForm.js');
  const { costTableXml } = await import('../js/forms/costHwpx.js');
  const { createExpense } = await import('../js/presets.js');
  const { createOtherSupport } = await import('../js/budget.js');
  const p = createProject('수학여행');
  Object.assign(p, {
    totalStudents: 74, actualParticipants: 74, chaperones: 0,
    fixedCosts: [
      { builtin: 'bus', mode: 'total', amount: 9_000_000, includeChaperones: false },
      { builtin: 'lodging', mode: 'perPerson', amount: 77837, memo: '2박' },
      { builtin: 'insurance', mode: 'perPerson', amount: 2000 }
    ]
  });
  p.expenses = [
    createExpense({ date: '2026-05-13', name: '롯데월드 자유이용권', unitAmount: 31000 }),
    createExpense({ date: '2026-05-14', name: '조식: 숙소식', unitAmount: 12000 })
  ];
  p.educationSupport = { ...p.educationSupport, regularPerPerson: 220000 };
  p.otherSupports = [createOtherSupport({ id: 's', name: '학교 자체 예산', amount: 64000 })];
  const model = costFormModel(p);

  assert.deepEqual(model.rows.map(row => [row.label.join(' '), row.items]), [
    ['5월 13일(수)', ['롯데월드 자유이용권: 31,000원']],
    ['5월 14일(목)', ['조식: 숙소식, 12,000원']],
    ['버스비', ['버스비: 9,000,000원 ÷ 74명 = 121,620원']],
    ['숙소비', ['숙소비: 77,837원(2박)']],
    ['보험비', ['보험비: 2,000원']]
  ]);
  assert.equal(model.perPerson, 31000 + 12000 + 121620 + 77837 + 2000);
  assert.deepEqual(model.notes, [
    '※ 교육청 예산(1인당 220,000원) 및 학교 자체 예산(1인당 24,457원) 지원',
    '※ 학부모 부담 금액(예상액): 1인당 총 0원'
  ], '지원금은 1인당 경비를 넘지 않게 적는다');
  assert.match(costFormHtml(model), /• 롯데월드 자유이용권: 31,000원/);

  const xml = costTableXml(model);
  assert.match(xml, /rowCnt="8" colCnt="2"/, '머리글 + 5줄 + 1인당 경비 + 안내');
  assert.match(xml, /treatAsChar="0"/);
  assert.match(xml, /paraPrIDRef="16"[^>]*><hp:run charPrIDRef="22"><hp:t>롯데월드 자유이용권: 31,000원<\/hp:t>/, '항목은 견본의 글머리표 문단');
  assert.match(xml, /colSpan="2" rowSpan="1"/);
});
