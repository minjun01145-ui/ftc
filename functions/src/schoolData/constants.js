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

export const SCHOOLINFO_SCHOOL_KINDS = Object.freeze([
  { code: '02', label: '초등학교' },
  { code: '03', label: '중학교' },
  { code: '04', label: '고등학교' },
  { code: '05', label: '특수학교' },
  { code: '06', label: '그 외 학교' },
  { code: '07', label: '각종학교' }
]);

export function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

export function getOfficeOrThrow(officeId) {
  const office = BUSAN_OFFICES[String(officeId ?? '')];
  if (!office) {
    throw new SchoolDataError(400, 'INVALID_EDUCATION_OFFICE', '부산광역시 교육지원청을 선택해 주세요.');
  }
  return office;
}

export function getOfficeRegionsOrThrow(officeId) {
  const office = getOfficeOrThrow(officeId);
  return office.areaNames.map(name => {
    const code = BUSAN_SGG_CODES[name];
    if (!code) throw new SchoolDataError(500, 'SCHOOL_AREA_CONFIG_ERROR', '교육지원청 관할 구역 설정을 확인할 수 없습니다.');
    return { name, code };
  });
}

export function getSchoolRegionOrThrow(officeId, regionCode) {
  const region = getOfficeRegionsOrThrow(officeId).find(item => item.code === String(regionCode ?? ''));
  if (!region) {
    throw new SchoolDataError(400, 'INVALID_SCHOOL_AREA', '선택한 교육지원청의 관할 구역 학교를 다시 선택해 주세요.');
  }
  return region;
}

export function getSchoolKindOrThrow(kindCode) {
  const kind = SCHOOLINFO_SCHOOL_KINDS.find(item => item.code === String(kindCode ?? ''));
  if (!kind) {
    throw new SchoolDataError(400, 'INVALID_SCHOOL_KIND', '학교 종류를 확인할 수 없습니다. 학교를 다시 검색해 주세요.');
  }
  return kind;
}
