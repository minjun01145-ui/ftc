import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCostMethod, costInputAmount, costMethodOf } from '../js/costMethods.js';
import { checkStudentExpenses } from '../js/expenseChecks.js';
import { createExpense, createProject } from '../js/presets.js';
import { buildStaffDraft } from '../js/staffDraft.js';
import { renderTripScheduleSection } from '../js/views/project/tripScheduleSection.js';

function tripProject() {
  const project = createProject();
  Object.assign(project, {
    startDate: '2026-05-13', endDate: '2026-05-15', executionMode: '숙박형',
    totalStudents: 72, actualParticipants: 70, contractedAbsentStudents: 1, chaperones: 8, dayAbsentSharesCommonCost: true,
    fixedCosts: {
      bus: { mode: 'total', amount: 9_000_000, includeChaperones: true, roundTo10: true },
      lodging: { mode: 'total', amount: 5_039_580 },
      insurance: { mode: 'perPerson', amount: 1600 }
    }
  });
  const item = (date, name, unitAmount) => createExpense({ date, name, unitAmount });
  project.expenses = [
    item('2026-05-13', '롯데월드 자유이용권', 30000), item('2026-05-13', '롯데월드 밀쿠폰', 20000), item('2026-05-13', '호텔 석식', 15000),
    item('2026-05-14', '파크텔 조식', 12000), item('2026-05-14', '통인시장 중식', 10000), item('2026-05-14', '파크텔 석식', 15000),
    item('2026-05-15', '파크텔 조식', 12000), item('2026-05-15', '덕평휴게소 중식', 10000)
  ];
  return project;
}

test('기초자료 점검: 정상 자료는 확인할 항목이 없다', () => {
  assert.deepEqual(checkStudentExpenses(tripProject()), []);
});

test('기초자료 점검: 이상한 단가, 빠진 식사, 기간 밖 날짜, 중복, 빠진 기타비를 알려 준다', () => {
  const project = tripProject();
  project.expenses[1].unitAmount = 200000;   // 0을 하나 더 붙임
  project.expenses[3].unitAmount = 12005;    // 1원 단위
  project.expenses[4].unitAmount = 100;      // 너무 적음
  project.expenses[5].name = '야간 산책';     // 2일차 석식 빠짐
  project.expenses.push(createExpense({ date: '2026-05-20', name: '추가 체험', unitAmount: 5000 }));
  project.expenses.push(createExpense({ date: '2026-05-15', name: '덕평휴게소 중식', unitAmount: 10000 }));
  project.fixedCosts.lodging.amount = 0;
  const issues = checkStudentExpenses(project).join('\n');

  assert.match(issues, /롯데월드 밀쿠폰: 단가 200,000원이 다른 항목보다 훨씬 큽니다/);
  assert.match(issues, /파크텔 조식: 단가가 12,005원으로 1원 단위/);
  assert.match(issues, /통인시장 중식: 단가 100원은 너무 적습니다/);
  assert.match(issues, /5월 14일\(목\): 석식이\(가\) 없습니다/);
  assert.match(issues, /추가 체험: 체험학습 기간 밖의 날짜입니다/);
  assert.match(issues, /같은 날 같은 이름의 항목이 두 번/);
  assert.match(issues, /숙박형인데 숙소비가 입력되지 않았습니다/);
  assert.doesNotMatch(issues, /5월 13일\(수\): 조식/, '첫날 조식은 묻지 않는다');
});

test('인솔자 초안: 체험처를 그대로 가져오고 버스비 1인당·버림 잔액·1인당 보험비를 만든다', () => {
  const draft = buildStaffDraft(tripProject());
  const summary = draft.map(row => [row.name, costMethodOf('staff', row), costInputAmount('staff', row)]);

  assert.deepEqual(summary.slice(0, 2), [['롯데월드 자유이용권', 'perStaff', 30000], ['롯데월드 밀쿠폰', 'perStaff', 20000]]);
  assert.deepEqual(summary.slice(8), [
    ['버스비', 'perStaff', 113920],
    ['버스비 버림 잔액', 'staffTotal', 320],
    ['보험비', 'perStaff', 1600]
  ]);
  assert.equal(draft.length, 11, '숙소비는 인솔자와 나누지 않고 잔액도 없으므로 넣지 않는다');
  assert.ok(draft.every(row => row.id));
});

test('일정은 저장 상태에서 날짜별로 묶은 보기 표로 보이고 메모(연락처 등) 칸을 쓴다', () => {
  const project = createProject();
  project.tripSchedule.items = [
    { id: 'a', date: '2026-05-13', name: '롯데월드', arrivalTime: '10:00', departureTime: '17:00', address: '서울 송파구', contact: '02-000-0000' },
    { id: 'b', date: '2026-05-14', name: '경복궁', arrivalTime: '09:00', departureTime: '', address: '', contact: '' }
  ];
  const html = renderTripScheduleSection(project);
  assert.match(html, /1일차 · 5월 13일\(수\)/);
  assert.match(html, /2일차 · 5월 14일\(목\)/);
  assert.match(html, /10:00 ~ 17:00/);
  assert.match(html, /09:00 도착/);
  assert.match(html, /메모\(연락처 등\)/);
  assert.doesNotMatch(html, /관계자 연락처/);
  assert.match(html, /data-trip-schedule-edit hidden/);
});

test('학생 총액 항목을 인솔자 초안에 넣으면 인솔자 1인당 금액으로 바뀐다', () => {
  const row = buildStaffDraft({ ...createProject(), expenses: [applyCostMethod('student', createExpense({ name: '공연' }), 'studentTotal', 18000)] })[0];
  assert.equal(costMethodOf('staff', row), 'perStaff');
  assert.equal(costInputAmount('staff', row), 18000);
});
