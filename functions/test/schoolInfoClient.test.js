import assert from 'node:assert/strict';
import test from 'node:test';
import { getSchoolInfoBasicRows, getSchoolInfoStudentRows } from '../src/schoolData/schoolInfoClient.js';

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

test('학교기본정보는 공식 GET 계약의 endpoint와 URL parameter를 사용한다', async () => {
  let request;
  const rows = [{ SCHUL_CODE: 'S123', SCHUL_NM: '예시중학교' }];
  const result = await getSchoolInfoBasicRows({
    apiKey: 'secret key&value', regionCode: '26200', kindCode: '03'
  }, async (url, options) => {
    request = { url: new URL(url), options };
    return response(200, { resultCode: 'success', resultMsg: '성공', list: rows });
  });

  assert.equal(request.url.origin, 'https://www.schoolinfo.go.kr');
  assert.equal(request.url.pathname, '/openApi.do');
  assert.equal(request.url.searchParams.get('apiKey'), 'secret key&value');
  assert.equal(request.url.searchParams.get('apiType'), '0');
  assert.equal(request.url.searchParams.get('sidoCode'), '26');
  assert.equal(request.url.searchParams.get('sggCode'), '26200');
  assert.equal(request.url.searchParams.get('schulKndCode'), '03');
  assert.equal(request.options.method, 'GET');
  assert.deepEqual(result, rows);
});

test('학생수 조회는 학년별·학급별 학생수의 공시연도를 포함한다', async () => {
  let requestUrl;
  await getSchoolInfoStudentRows({ apiKey: 'key', regionCode: '26200', kindCode: '03', reportYear: 2026 }, async url => {
    requestUrl = new URL(url);
    return response(200, { resultCode: 'success', list: [] });
  });

  assert.equal(requestUrl.searchParams.get('apiType'), '09');
  assert.equal(requestUrl.searchParams.get('pbanYr'), '2026');
  assert.equal(requestUrl.searchParams.get('sggCode'), '26200');
  assert.deepEqual(await getSchoolInfoBasicRows({ apiKey: 'key', regionCode: '26200', kindCode: '03' }, async () =>
    response(200, { resultCode: 'fail', resultMsg: '조회결과가 없습니다.' })), []);
});

test('인증 오류는 안전한 구분 코드로 반환하고 키나 upstream 문구를 노출하지 않는다', async () => {
  await assert.rejects(
    getSchoolInfoBasicRows({ apiKey: 'do-not-leak', regionCode: '26200', kindCode: '03' }, async () =>
      response(200, { resultCode: 'fail', resultMsg: '인증키 do-not-leak가 유효하지 않습니다.' })),
    error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'SCHOOLINFO_AUTHENTICATION_FAILED');
      assert.doesNotMatch(error.message, /do-not-leak|인증키/);
      return true;
    }
  );
});

test('잘못된 upstream envelope와 list는 빈 결과로 숨기지 않는다', async () => {
  for (const payload of [null, { resultCode: 'success' }, { resultCode: 'success', list: {} },
    { resultCode: 'success', list: [null] }, '<html>gateway failure</html>']) {
    await assert.rejects(
      getSchoolInfoBasicRows({ apiKey: 'key', regionCode: '26200', kindCode: '03' }, async () => ({
        ...response(200, payload),
        json: async () => {
          if (typeof payload === 'string') throw new SyntaxError('invalid JSON');
          return payload;
        }
      })),
      error => error.code === 'SCHOOLINFO_INVALID_RESPONSE'
    );
  }
});

test('upstream의 요청 거부와 미분류 API 실패는 자료 없음과 구분하고 원문을 숨긴다', async () => {
  const params = { apiKey: 'private-key', regionCode: '26200', kindCode: '03' };
  await assert.rejects(getSchoolInfoBasicRows(params, async () =>
    response(200, { resultCode: 'fail', resultMsg: '필수 파라미터가 누락되었습니다.' })), error => {
    assert.equal(error.code, 'SCHOOLINFO_REQUEST_REJECTED');
    assert.doesNotMatch(error.message, /필수 파라미터|private-key/);
    return true;
  });
  await assert.rejects(getSchoolInfoBasicRows(params, async () =>
    response(200, { resultCode: 'fail', resultMsg: 'internal gateway detail private-key' })), error => {
    assert.equal(error.code, 'SCHOOLINFO_API_ERROR');
    assert.doesNotMatch(error.message, /internal gateway detail|private-key/);
    return true;
  });
});

test('upstream 상태, 인증 거절, timeout을 서로 다른 HTTP status로 처리한다', async () => {
  const params = { apiKey: 'key', regionCode: '26200', kindCode: '03' };
  await assert.rejects(getSchoolInfoBasicRows(params, async () => response(429, {})), error => error.status === 503 && error.code === 'SCHOOLINFO_RATE_LIMITED');
  await assert.rejects(getSchoolInfoBasicRows(params, async () => response(503, {})), error => error.status === 502 && error.code === 'SCHOOLINFO_UPSTREAM_ERROR');
  await assert.rejects(getSchoolInfoBasicRows(params, async () => response(401, {})), error => error.status === 503 && error.code === 'SCHOOLINFO_AUTHENTICATION_FAILED');
  await assert.rejects(getSchoolInfoBasicRows(params, async () => {
    const error = new Error('request timed out');
    error.name = 'TimeoutError';
    throw error;
  }), error => error.status === 504 && error.code === 'SCHOOLINFO_TIMEOUT');
});
