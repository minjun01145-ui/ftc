import { SchoolDataError } from './errors.js';

export const BUSAN_OFFICES = Object.freeze({
  seobu: { label: '서부교육지원청', areaNames: ['중구', '서구', '영도구', '사하구'] },
  namBu: { label: '남부교육지원청', areaNames: ['동구', '부산진구', '남구'] },
  bukbu: { label: '북부교육지원청', areaNames: ['북구', '사상구', '강서구'] },
  dongnae: { label: '동래교육지원청', areaNames: ['동래구', '금정구', '연제구'] },
  haeundae: { label: '해운대교육지원청', areaNames: ['해운대구', '수영구', '기장군'] }
});

export const BUSAN_SGG_CODES = Object.freeze({
  중구: '26110',
  서구: '26140',
  동구: '26170',
  영도구: '26200',
  부산진구: '26230',
  동래구: '26260',
  남구: '26290',
  북구: '26320',
  해운대구: '26350',
  사하구: '26380',
  금정구: '26410',
  강서구: '26440',
  연제구: '26470',
  수영구: '26500',
  사상구: '26530',
  기장군: '26710'
});

export function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

export function getEducationOffice(school) {
  const jurisdiction = normalizeText(school.JU_ORG_NM);
  for (const [officeId, office] of Object.entries(BUSAN_OFFICES)) {
    if (jurisdiction.includes(normalizeText(office.label))) return officeId;
  }

  const address = String(school.ORG_RDNMA ?? '');
  if (!address.includes('부산광역시')) return '';
  const area = Object.keys(BUSAN_SGG_CODES).find(name => address.includes(name));
  if (!area) return '';

  return Object.entries(BUSAN_OFFICES).find(([, office]) => office.areaNames.includes(area))?.[0] ?? '';
}

export function getSchoolInfoRegionCode(address) {
  const value = String(address ?? '');
  if (!value.includes('부산광역시')) {
    throw new SchoolDataError(400, 'BUSAN_SCHOOLS_ONLY', '부산광역시 학교만 조회할 수 있습니다.');
  }
  const district = Object.keys(BUSAN_SGG_CODES).find(name => value.includes(name));
  if (!district) {
    throw new SchoolDataError(422, 'SCHOOL_AREA_NOT_FOUND', '학교 주소에서 부산 시·군·구를 확인하지 못했습니다. 학교 검색 결과를 다시 선택해 주세요.');
  }
  return BUSAN_SGG_CODES[district];
}

export function getSchoolInfoKindCode(schoolType) {
  const type = String(schoolType ?? '');
  if (type.includes('초등학교')) return '02';
  if (type.includes('중학교')) return '03';
  if (type.includes('고등학교')) return '04';
  if (type.includes('특수학교')) return '05';
  if (type.includes('각종학교')) return '07';
  return '06';
}

export function getOfficeOrThrow(officeId) {
  const office = BUSAN_OFFICES[String(officeId ?? '')];
  if (!office) {
    throw new SchoolDataError(400, 'INVALID_EDUCATION_OFFICE', '부산광역시 교육지원청을 선택해 주세요.');
  }
  return office;
}
