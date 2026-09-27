import { schoolInfoConfig } from './schoolInfoConfig.js';

async function requestSchoolData(action, payload) {
  if (!schoolInfoConfig.gatewayUrl.trim()) {
    throw new Error('학교 조회 서버 주소가 설정되지 않았습니다. js/services/schoolInfoConfig.js의 gatewayUrl을 설정해 주세요.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), schoolInfoConfig.requestTimeoutMs);
  try {
    const response = await fetch(schoolInfoConfig.gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.error?.message || '학교 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('학교 정보 조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (error instanceof TypeError) {
      throw new Error('학교 조회 서버에 연결할 수 없습니다. 서버 주소와 배포 상태를 확인해 주세요.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchSchools({ educationOffice, query = '' }) {
  const result = await requestSchoolData('searchSchools', { educationOffice, query });
  return Array.isArray(result.schools) ? result.schools : [];
}

export async function getSchoolStudentCounts({
  educationOffice,
  schoolCode,
  schoolRegionCode,
  reportYear
}) {
  return requestSchoolData('studentCounts', {
    educationOffice,
    schoolCode,
    schoolRegionCode,
    reportYear
  });
}
