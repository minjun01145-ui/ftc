import { SchoolDataError } from './errors.js';

const SCHOOLINFO_URL = 'https://www.schoolinfo.go.kr/openApi.do';

async function requestSchoolInfo(params, apiKey) {
  if (!apiKey) throw new SchoolDataError(503, 'SCHOOLINFO_KEY_MISSING', '학교알리미 OpenAPI 키가 서버에 설정되지 않았습니다.');

  const url = new URL(SCHOOLINFO_URL);
  url.searchParams.set('apiKey', apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new SchoolDataError(502, 'SCHOOLINFO_UNAVAILABLE', '학교알리미에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  if (!response.ok) {
    throw new SchoolDataError(502, 'SCHOOLINFO_UNAVAILABLE', '학교알리미 학생수 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SchoolDataError(502, 'SCHOOLINFO_INVALID_RESPONSE', '학교알리미 응답을 읽지 못했습니다.');
  }

  if (payload?.resultCode !== 'success') {
    const message = String(payload?.resultMsg ?? '');
    if (/데이터가 없|조회 결과가 없|검색 결과가 없|자료가 없/.test(message)) return [];
    throw new SchoolDataError(502, 'SCHOOLINFO_API_ERROR', '학교알리미 API에서 오류를 반환했습니다. 인증키와 요청 연도를 확인해 주세요.');
  }
  return Array.isArray(payload.list) ? payload.list : [];
}

export function getSchoolInfoBasicRows({ apiKey, regionCode, kindCode }) {
  return requestSchoolInfo({
    apiType: '0',
    sidoCode: '26',
    sggCode: regionCode,
    schulKndCode: kindCode
  }, apiKey);
}

export function getSchoolInfoStudentRows({ apiKey, regionCode, kindCode, reportYear }) {
  return requestSchoolInfo({
    apiType: '09',
    pbanYr: reportYear,
    sidoCode: '26',
    sggCode: regionCode,
    schulKndCode: kindCode
  }, apiKey);
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
