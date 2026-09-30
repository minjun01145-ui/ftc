import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState } from '../js/storage.js';

function withStorage(entries, run) {
  const previous = globalThis.localStorage;
  const values = new Map(entries);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  try { run(values); } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

test('main 저장 자료가 있으면 contest 자료보다 우선한다', () => {
  withStorage([
    ['fieldtrip-budget-mvp:v2', JSON.stringify({ projects: [{ id: 'main' }] })],
    ['fieldtrip-cost-manager:v1', JSON.stringify({ projects: [{ id: 'contest' }] })]
  ], () => assert.equal(loadState().projects[0].id, 'main'));
});

test('contest 저장 자료를 읽고 기존 main 키에 저장하며 원본도 유지한다', () => {
  const state = { schemaVersion: 6, school: { name: '학교' }, projects: [{ id: 'contest' }] };
  const raw = JSON.stringify(state);
  withStorage([['fieldtrip-cost-manager:v1', raw]], values => {
    assert.deepEqual(loadState(), state);
    saveState(loadState());
    assert.equal(values.get('fieldtrip-budget-mvp:v2'), raw);
    assert.equal(values.get('fieldtrip-cost-manager:v1'), raw);
  });
});

test('예전 v1 자료의 학교 정보 이관도 유지한다', () => {
  withStorage([['fieldtrip-budget-mvp:v1', JSON.stringify({ meta: { schoolName: '이전학교', schoolYear: 2025 } })]], () => {
    assert.equal(loadState().school.name, '이전학교');
    assert.equal(loadState().school.schoolYear, 2025);
  });
});
