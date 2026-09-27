import assert from 'node:assert/strict';
import test from 'node:test';
import { findSchools, findStudentCounts } from '../src/schoolData/index.js';

const key = { schoolInfoApiKey: 'test-only-secret' };

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function withFetch(stub, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('학교 검색은 부산 중학교 가운데 공립만 반환한다', async () => {
  const result = await withFetch(async input => {
    const url = new URL(input);
    const list = url.searchParams.get('sggCode') === '26110' ? [
      { SCHUL_CODE: 'public-1', SCHUL_NM: '빛샘중학교', FOND_SC_CODE: '공립', SCHUL_FOND_TYP_CODE: '단설', HMPG_ADRES: '' },
      { SCHUL_CODE: 'private-1', SCHUL_NM: '빛샘사립중학교', FOND_SC_CODE: '사립', SCHUL_FOND_TYP_CODE: '부설', HMPG_ADRES: '' }
    ] : [];
    return jsonResponse({ resultCode: 'success', resultMsg: '정상', list });
  }, () => findSchools({ educationOffice: 'seobu', query: '빛샘' }, key));

  assert.equal(result.schools.length, 1);
  assert.equal(result.schools[0].schoolCode, 'public-1');
  assert.equal(result.schools[0].schoolKindCode, '03');
});

test('너무 긴 학교 검색어는 학교알리미 요청 전에 입력 오류로 거절한다', async () => {
  let requests = 0;
  const error = await withFetch(async () => {
    requests += 1;
    return jsonResponse({ resultCode: 'success', list: [] });
  }, () => findSchools({ educationOffice: 'seobu', query: '가'.repeat(41) }, key).catch(value => value));

  assert.equal(error.status, 400);
  assert.equal(error.code, 'INVALID_QUERY');
  assert.equal(requests, 0);
});

test('찾을 수 없는 학교는 upstream 오류 대신 학교 미발견 404로 구분한다', async () => {
  let requests = 0;
  const error = await withFetch(async () => {
    requests += 1;
    return jsonResponse({ resultCode: 'success', resultMsg: '정상', list: [] });
  }, () => findStudentCounts({
    educationOffice: 'seobu', schoolCode: 'unknown-school', schoolRegionCode: '26110', reportYear: 2026
  }, key).catch(value => value));

  assert.equal(requests, 2);
  assert.equal(error.status, 404);
  assert.equal(error.code, 'SCHOOL_NOT_FOUND');
  assert.ok(!error.message.includes(key.schoolInfoApiKey));
});
