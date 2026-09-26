import {
  getEducationOffice,
  getOfficeOrThrow,
  getSchoolInfoKindCode,
  getSchoolInfoRegionCode,
  normalizeText
} from './constants.js';
import { SchoolDataError } from './errors.js';
import { getBusanSchoolByCode, searchBusanSchools } from './neisClient.js';
import { getSchoolInfoBasicRows, getSchoolInfoStudentRows, readStudentCounts } from './schoolInfoClient.js';

function getApiKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    neisApiKey: String(value.neisApiKey ?? '').trim(),
    schoolInfoApiKey: String(value.schoolInfoApiKey ?? '').trim()
  };
}

function normalizeSchool(row, educationOffice) {
  return {
    schoolCode: String(row.SD_SCHUL_CODE ?? ''),
    name: String(row.SCHUL_NM ?? '').trim(),
    schoolType: String(row.SCHUL_KND_SC_NM ?? '').trim(),
    educationOffice,
    address: String(row.ORG_RDNMA ?? '').trim(),
    homepage: String(row.HMPG_ADRES ?? '').trim()
  };
}

export async function findSchools({ educationOffice, query = '' }, secretValue) {
  const office = getOfficeOrThrow(educationOffice);
  const searchText = String(query ?? '').trim();
  if (searchText.length > 40) throw new SchoolDataError(400, 'INVALID_QUERY', '학교 검색어는 40자 이내로 입력해 주세요.');

  const keys = getApiKeys(secretValue);
  const rows = await searchBusanSchools(keys.neisApiKey);
  const queryKey = normalizeText(searchText);
  const schools = rows
    .filter(row => getEducationOffice(row) === educationOffice)
    .map(row => normalizeSchool(row, educationOffice))
    .filter(school => school.schoolCode && school.name && (!queryKey || normalizeText(school.name).includes(queryKey)))
    .sort((left, right) => left.name.localeCompare(right.name, 'ko-KR'));

  return { schools, office: office.label };
}

function requireString(value, label, maxLength = 80) {
  const result = String(value ?? '').trim();
  if (!result || result.length > maxLength) {
    throw new SchoolDataError(400, 'INVALID_SCHOOL', `${label} 정보가 올바르지 않습니다. 학교를 다시 검색해 주세요.`);
  }
  return result;
}

function requireReportYear(value) {
  const reportYear = Number(value);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(reportYear) || reportYear > currentYear || reportYear < currentYear - 2) {
    throw new SchoolDataError(400, 'INVALID_REPORT_YEAR', `학교알리미에서 조회할 수 있는 최근 3년(${currentYear - 2}~${currentYear})의 공시연도를 선택해 주세요.`);
  }
  return reportYear;
}

export async function findStudentCounts({ educationOffice, schoolCode, reportYear: rawYear }, secretValue) {
  getOfficeOrThrow(educationOffice);
  const code = requireString(schoolCode, '학교코드', 24);
  const reportYear = requireReportYear(rawYear);
  const keys = getApiKeys(secretValue);
  const school = await getBusanSchoolByCode(keys.neisApiKey, code);
  if (!school || getEducationOffice(school) !== educationOffice) {
    throw new SchoolDataError(404, 'SCHOOL_NOT_FOUND', '선택한 교육지원청의 학교를 찾지 못했습니다. 학교를 다시 검색해 주세요.');
  }

  const kindCode = getSchoolInfoKindCode(school.SCHUL_KND_SC_NM);
  const regionCode = getSchoolInfoRegionCode(school.ORG_RDNMA);
  const schoolInfoContext = { apiKey: keys.schoolInfoApiKey, regionCode, kindCode };
  const normalizedName = normalizeText(school.SCHUL_NM);
  const [basicRows, studentRows] = await Promise.all([
    getSchoolInfoBasicRows(schoolInfoContext),
    getSchoolInfoStudentRows({ ...schoolInfoContext, reportYear })
  ]);
  const matchedSchools = basicRows.filter(row => normalizeText(row.SCHUL_NM) === normalizedName);
  if (matchedSchools.length !== 1) {
    throw new SchoolDataError(404, 'SCHOOLINFO_SCHOOL_NOT_FOUND', '학교알리미에서 해당 학교를 하나로 확인하지 못했습니다. 학생수를 직접 입력해 주세요.');
  }

  const schoolInfoCode = String(matchedSchools[0].SCHUL_CODE ?? '');
  if (!schoolInfoCode) {
    throw new SchoolDataError(502, 'SCHOOLINFO_SCHOOL_CODE_MISSING', '학교알리미 학교코드를 확인하지 못했습니다.');
  }

  const row = studentRows.find(item => String(item.SCHUL_CODE ?? '') === schoolInfoCode);
  if (!row) {
    throw new SchoolDataError(404, 'SCHOOLINFO_DATA_NOT_FOUND', `${reportYear}년 학교알리미 공시자료가 없습니다. 공시연도를 바꾸거나 학생수를 직접 입력해 주세요.`);
  }

  const counts = readStudentCounts(row, kindCode);
  if (Object.values(counts).some(value => value === null)) {
    throw new SchoolDataError(422, 'SCHOOLINFO_COUNT_INCOMPLETE', '학교알리미에서 1~3학년 학생수를 모두 확인하지 못했습니다. 누락된 값은 직접 입력해 주세요.');
  }

  return {
    schoolName: String(school.SCHUL_NM ?? ''),
    schoolType: String(school.SCHUL_KND_SC_NM ?? ''),
    reportYear,
    counts
  };
}

export async function executeSchoolDataAction(body, secretValue) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SchoolDataError(400, 'INVALID_BODY', 'JSON 객체가 필요합니다.');
  }
  if (body.action === 'searchSchools') {
    return findSchools({ educationOffice: body.educationOffice, query: body.query }, secretValue);
  }
  if (body.action === 'studentCounts') {
    return findStudentCounts({
      educationOffice: body.educationOffice,
      schoolCode: body.schoolCode,
      reportYear: body.reportYear
    }, secretValue);
  }
  throw new SchoolDataError(400, 'INVALID_ACTION', '지원하지 않는 학교 정보 요청입니다.');
}
