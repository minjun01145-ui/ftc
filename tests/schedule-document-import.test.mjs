import assert from 'node:assert/strict';
import test from 'node:test';
import { createScheduleDocumentImportService, TRIP_SCHEDULE_DOCUMENT_CAPABILITY } from '../js/services/scheduleDocumentImport.js';

const file = { name: '수학여행.hwpx', type: 'application/zip', size: 2048 };
const existingSchedule = [{ id: 'old-item', name: '기존 일정' }];

test('문서 분석 성공은 editable draft rows 용 항목을 반환하고 파일이나 텍스트를 저장하지 않는다', async () => {
  const expectedItems = [{ date: '2026-05-12', name: '박물관', arrivalTime: '10:00', departureTime: '', address: '', contact: '' }];
  let call;
  const importer = createScheduleDocumentImportService({
    aiClient: { async invokeDocument(...args) { call = args; return { ok: true, result: { items: expectedItems } }; } }
  });

  const draft = await importer.importFile(file, {
    projectTitle: '2학년 수학여행', schoolYear: 2026, startDate: '2026-05-11', endDate: '2026-05-13'
  });

  assert.equal(call[0], TRIP_SCHEDULE_DOCUMENT_CAPABILITY);
  assert.equal(call[1], file);
  assert.deepEqual(call[2], {
    projectTitle: '2학년 수학여행', schoolYear: '2026', startDate: '2026-05-11', endDate: '2026-05-13'
  });
  assert.deepEqual(draft, expectedItems);
  assert.deepEqual(existingSchedule, [{ id: 'old-item', name: '기존 일정' }]);
});

test('0개 일정 결과는 빈 draft만 반환해 기존 일정을 그대로 둔다', async () => {
  const importer = createScheduleDocumentImportService({
    aiClient: { async invokeDocument() { return { ok: true, result: { items: [] } }; } }
  });

  assert.deepEqual(await importer.importFile(file), []);
  assert.deepEqual(existingSchedule, [{ id: 'old-item', name: '기존 일정' }]);
});

test('분석 실패는 기존 일정에 손대지 않고 오류를 전달한다', async () => {
  const importer = createScheduleDocumentImportService({
    aiClient: { async invokeDocument() { throw Object.assign(new Error('문서에서 텍스트를 찾지 못했습니다.'), { code: 'DOCUMENT_TEXT_NOT_FOUND' }); } }
  });

  await assert.rejects(importer.importFile(file), error => error.code === 'DOCUMENT_TEXT_NOT_FOUND');
  assert.deepEqual(existingSchedule, [{ id: 'old-item', name: '기존 일정' }]);
});

test('응답 shape가 올바르지 않으면 draft를 만들지 않는다', async () => {
  const importer = createScheduleDocumentImportService({
    aiClient: { async invokeDocument() { return { ok: true, result: {} }; } }
  });

  await assert.rejects(importer.importFile(file), error => error.code === 'AI_INVALID_RESPONSE');
  assert.deepEqual(existingSchedule, [{ id: 'old-item', name: '기존 일정' }]);
});
