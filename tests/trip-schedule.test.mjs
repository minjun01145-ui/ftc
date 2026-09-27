import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpense, createTripScheduleItem, normalizeState } from '../js/presets.js';
import { MAX_SCHEDULE_DOCUMENT_BYTES, validateScheduleFiles } from '../js/services/scheduleUpload.js';
import { syncExpensesFromTripSchedule } from '../js/tripSchedule.js';
import { renderTripScheduleSection } from '../js/views/project/tripScheduleSection.js';
import { renderProjectList } from '../js/views/sidebarView.js';

const scheduleItem = createTripScheduleItem({
  id: 'schedule-1',
  date: '2026-05-13',
  name: '박물관',
  arrivalTime: '10:00',
  departureTime: '12:00',
  address: '서울시 예시로 1'
});

test('기존 저장 데이터에는 빈 체험학습 일정 모델을 보완한다', () => {
  const state = normalizeState({
    schemaVersion: 3,
    school: {},
    projects: [{ title: '기존 사업', expenses: [{ id: 'expense-1', name: '차량비' }] }]
  });

  assert.equal(state.schemaVersion, 6);
  assert.deepEqual(state.projects[0].tripSchedule, { items: [] });
  assert.equal(state.projects[0].expenses[0].sourceScheduleItemId, null);
});

test('일정 저장 시 체험처/비용 행을 만들고 수동 비용은 보존한다', () => {
  const manual = createExpense({ id: 'manual-1', name: '보험비', unitAmount: 1500 });
  const expenses = syncExpensesFromTripSchedule({ items: [scheduleItem] }, [manual]);

  assert.equal(expenses.length, 2);
  assert.equal(expenses[0].sourceScheduleItemId, 'schedule-1');
  assert.equal(expenses[0].name, '박물관');
  assert.equal(expenses[0].details.arrivalTime, '10:00');
  assert.equal(expenses[1].id, 'manual-1');
});

test('연결된 비용의 금액 입력은 유지하고 일정 정보만 갱신한다', () => {
  const previous = createExpense({
    id: 'expense-linked',
    sourceScheduleItemId: 'schedule-1',
    date: '2026-05-13',
    name: '기존 체험처명',
    unitAmount: 25000,
    actualAmount: 24000,
    details: { arrivalTime: '09:00', departureTime: '', address: '', contact: '' }
  });
  const changed = { ...scheduleItem, date: '2026-05-14', name: '수정된 체험처', arrivalTime: '11:00' };

  const [expense] = syncExpensesFromTripSchedule({ items: [changed] }, [previous]);

  assert.equal(expense.id, 'expense-linked');
  assert.equal(expense.date, '2026-05-14');
  assert.equal(expense.name, '수정된 체험처');
  assert.equal(expense.unitAmount, 25000);
  assert.equal(expense.actualAmount, 24000);
  assert.equal(expense.details.arrivalTime, '11:00');
});

test('일정에서 삭제된 연결 행은 제거하지만 수동 행은 제거하지 않는다', () => {
  const linked = createExpense({ id: 'linked', sourceScheduleItemId: 'schedule-old', name: '삭제된 일정' });
  const manual = createExpense({ id: 'manual', name: '차량비' });

  const expenses = syncExpensesFromTripSchedule({ items: [] }, [linked, manual]);

  assert.deepEqual(expenses.map(item => item.id), ['manual']);
});

test('일정 문서 업로드는 PDF와 HWPX 한 개만 허용하고 HWP/JPG 및 대용량 파일은 거절한다', () => {
  const result = validateScheduleFiles([
    { name: 'plan.pdf', type: 'application/pdf', size: 100 },
    { name: 'plan.hwpx', type: 'application/zip', size: 100 }
  ]);

  assert.deepEqual(result.accepted, []);
  assert.equal(result.error, 'MULTIPLE_DOCUMENTS');

  const pdf = validateScheduleFiles([{ name: 'plan.pdf', type: 'application/pdf', size: 100 }]);
  const hwpx = validateScheduleFiles([{ name: 'plan.hwpx', type: 'application/x-hwp', size: 100 }]);
  const unsupported = validateScheduleFiles([{ name: 'plan.hwp', type: 'application/x-hwp', size: 100 }]);
  const jpg = validateScheduleFiles([{ name: 'scan.jpg', type: 'image/jpeg', size: 100 }]);
  const oversized = validateScheduleFiles([{ name: 'large.pdf', type: 'application/pdf', size: MAX_SCHEDULE_DOCUMENT_BYTES + 1 }]);

  assert.deepEqual(pdf.accepted.map(file => file.name), ['plan.pdf']);
  assert.deepEqual(hwpx.accepted.map(file => file.name), ['plan.hwpx']);
  assert.equal(unsupported.error, 'UNSUPPORTED_DOCUMENT_TYPE');
  assert.equal(jpg.error, 'UNSUPPORTED_DOCUMENT_TYPE');
  assert.equal(oversized.error, 'DOCUMENT_TOO_LARGE');
});

test('사업정보 일정 화면은 PDF/HWPX 가져오기와 직접 편집 경로를 제공한다', () => {
  const html = renderTripScheduleSection({ tripSchedule: { items: [scheduleItem] } });

  assert.match(html, /accept="\.pdf,\.hwpx,application\/pdf,application\/haansofthwpx,application\/vnd\.hancom\.hwpx"/);
  assert.doesNotMatch(html, /multiple|파일 내용은 자동 입력되지 않습니다/);
  assert.match(html, /data-schedule-field="name"[^>]*value="박물관"[^>]*readonly/);
  assert.match(html, /data-action="add-schedule-item"/);
  assert.match(html, /data-action="edit-trip-schedule"/);
  assert.match(html, /data-action="save-trip-schedule"/);
});

test('사업 제목을 누르면 사업정보가 기본 목적지가 된다', () => {
  const html = renderProjectList(
    [{ id: 'project-1', title: '수학여행' }],
    { type: 'school', projectId: null, section: null }
  );

  assert.match(html, /class="project-item [^"]*"[\s\S]*data-project-section="business"/);
});
