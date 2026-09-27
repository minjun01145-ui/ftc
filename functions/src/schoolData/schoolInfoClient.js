import { SchoolDataError } from './errors.js';

const SCHOOLINFO_URL = 'https://www.schoolinfo.go.kr/openApi.do';

const noDataMessage = /데이터.{0,12}(?:없|존재하지)|(?:조회|검색).{0,12}(?:결과|자료|데이터).{0,8}(?:없|존재하지)|자료.{0,8}(?:없|존재하지)|no\s+(?:data|results?)|(?:data|results?).{0,12}(?:not found|does not exist)/i;
const authenticationMessage = /인증|api\s*key|apikey|api키|접근.{0,8}권한|권한.{0,8}(?:없|거부)|승인/i;
const requestMessage = /필수.{0,8}(?:항목|파라미터|parameter)|(?:항목|파라미터|parameter).{0,8}필수|잘못된.{0,8}(?:요청|파라미터|parameter)|유효하지 않은.{0,8}(?:요청|파라미터|parameter)|invalid.{0,12}(?:request|parameter|api.?type|school|year|code)|missing.{0,12}(?:parameter|field)/i;

async function requestSchoolInfo(params, apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new SchoolDataError(503, 'SCHOOLINFO_KEY_MISSING', '학교알리미 OpenAPI 키가 서버에 설정되지 않았습니다.');

  const url = new URL(SCHOOLINFO_URL);
  url.searchParams.set('apiKey', apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new SchoolDataError(504, 'SCHOOLINFO_TIMEOUT', '학교알리미 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw new SchoolDataError(503, 'SCHOOLINFO_UNAVAILABLE', '학교알리미에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new SchoolDataError(503, 'SCHOOLINFO_RATE_LIMITED', '학교알리미 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new SchoolDataError(503, 'SCHOOLINFO_AUTHENTICATION_FAILED', '학교알리미 인증을 확인할 수 없습니다. 관리자에게 문의해 주세요.');
    }
    if (response.status >= 500) {
      throw new SchoolDataError(502, 'SCHOOLINFO_UPSTREAM_ERROR', '학교알리미 서버가 오류를 반환했습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw new SchoolDataError(502, 'SCHOOLINFO_REQUEST_REJECTED', '학교알리미가 조회 요청을 거부했습니다. 학교 정보와 조회연도를 확인해 주세요.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SchoolDataError(502, 'SCHOOLINFO_INVALID_RESPONSE', '학교알리미 응답을 읽지 못했습니다.');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SchoolDataError(502, 'SCHOOLINFO_INVALID_RESPONSE', '학교알리미 응답 형식이 올바르지 않습니다.');
  }

  if (payload.resultCode === 'fail') {
    const message = String(payload.resultMsg ?? '');
    if (noDataMessage.test(message)) return [];
    if (authenticationMessage.test(message)) {
      throw new SchoolDataError(503, 'SCHOOLINFO_AUTHENTICATION_FAILED', '학교알리미 인증을 확인할 수 없습니다. 관리자에게 문의해 주세요.');
    }
    if (requestMessage.test(message)) {
      throw new SchoolDataError(502, 'SCHOOLINFO_REQUEST_REJECTED', '학교알리미가 조회 조건을 거부했습니다. 학교 정보와 조회연도를 확인해 주세요.');
    }
    throw new SchoolDataError(502, 'SCHOOLINFO_API_ERROR', '학교알리미가 조회 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  if (payload.resultCode !== 'success' || !Array.isArray(payload.list)
      || payload.list.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new SchoolDataError(502, 'SCHOOLINFO_INVALID_RESPONSE', '학교알리미 응답 형식이 올바르지 않습니다.');
  }
  return payload.list;
}

export function getSchoolInfoBasicRows({ apiKey, regionCode, kindCode }, fetchImpl) {
  return requestSchoolInfo({
    apiType: '0',
    sidoCode: '26',
    sggCode: regionCode,
    schulKndCode: kindCode
  }, apiKey, fetchImpl);
}

export function getSchoolInfoStudentRows({ apiKey, regionCode, kindCode, reportYear }, fetchImpl) {
  return requestSchoolInfo({
    apiType: '09',
    pbanYr: reportYear,
    sidoCode: '26',
    sggCode: regionCode,
    schulKndCode: kindCode
  }, apiKey, fetchImpl);
}

function readCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(String(value).replaceAll(',', '').trim());
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : null;
}

function sumPresentCounts(row, fields) {
  const values = fields.map(field => readCount(row[field])).filter(value => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function readStudentCounts(row, kindCode) {
  if (kindCode === '05') {
    // 특수학교는 유초등부·중등부·고등부가 서로 다른 항목 ID를 사용합니다.
    return {
      grade1Students: sumPresentCounts(row, ['COL_S2', 'COL_S8', 'COL_S11']),
      grade2Students: sumPresentCounts(row, ['COL_S3', 'COL_S9', 'COL_S12']),
      grade3Students: sumPresentCounts(row, ['COL_S4', 'COL_S10', 'COL_S13'])
    };
  }
  return {
    grade1Students: readCount(row.COL_S1),
    grade2Students: readCount(row.COL_S2),
    grade3Students: readCount(row.COL_S3)
  };
}
