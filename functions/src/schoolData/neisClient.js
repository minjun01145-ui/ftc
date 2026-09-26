import { SchoolDataError } from './errors.js';

const NEIS_URL = 'https://open.neis.go.kr/hub/schoolInfo';

function getNeisResult(payload) {
  const root = Array.isArray(payload?.schoolInfo) ? payload.schoolInfo : [];
  const head = root.find(item => Array.isArray(item?.head))?.head ?? [];
  const result = payload?.RESULT ?? head.find(item => item?.RESULT)?.RESULT;
  const rows = root.find(item => Array.isArray(item?.row))?.row ?? [];
  return { result, rows };
}

async function requestNeis(params) {
  const url = new URL(NEIS_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  } catch {
    throw new SchoolDataError(502, 'NEIS_UNAVAILABLE', '나이스 학교정보에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  if (!response.ok) {
    throw new SchoolDataError(502, 'NEIS_UNAVAILABLE', '나이스 학교정보 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SchoolDataError(502, 'NEIS_INVALID_RESPONSE', '나이스 학교정보 응답을 읽지 못했습니다.');
  }

  const { result, rows } = getNeisResult(payload);
  if (result?.CODE && result.CODE !== 'INFO-000' && result.CODE !== 'INFO-200') {
    throw new SchoolDataError(502, 'NEIS_API_ERROR', '나이스 학교정보 API에서 오류를 반환했습니다.');
  }
  return rows;
}

export async function searchBusanSchools(apiKey) {
  if (!apiKey) throw new SchoolDataError(503, 'NEIS_KEY_MISSING', '나이스 OpenAPI 키가 서버에 설정되지 않았습니다.');
  return requestNeis({
    KEY: apiKey,
    Type: 'json',
    pIndex: '1',
    pSize: '1000',
    ATPT_OFCDC_SC_CODE: 'C10'
  });
}

export async function getBusanSchoolByCode(apiKey, schoolCode) {
  if (!apiKey) throw new SchoolDataError(503, 'NEIS_KEY_MISSING', '나이스 OpenAPI 키가 서버에 설정되지 않았습니다.');
  const rows = await requestNeis({
    KEY: apiKey,
    Type: 'json',
    pIndex: '1',
    pSize: '10',
    ATPT_OFCDC_SC_CODE: 'C10',
    SD_SCHUL_CODE: schoolCode
  });
  return rows.find(row => String(row.SD_SCHUL_CODE ?? '') === schoolCode) ?? null;
}
