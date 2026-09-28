import { loadScript } from './scriptLoader.js';

const SDK_URL = 'https://dapi.kakao.com/v2/maps/sdk.js';

export class PlaceSearchError extends Error {
  constructor(message, { code = 'PLACE_SEARCH_FAILED' } = {}) {
    super(message);
    this.name = 'PlaceSearchError';
    this.code = code;
  }
}

function loadScriptTag(src) {
  return loadScript(src).catch(() => {
    throw new PlaceSearchError('카카오맵을 불러오지 못했습니다. 네트워크 또는 앱 키의 도메인 등록을 확인해 주세요.', { code: 'KAKAO_SDK_LOAD_FAILED' });
  });
}

function toPlace(document) {
  return {
    name: String(document.place_name ?? ''),
    address: String(document.address_name ?? ''),
    roadAddress: String(document.road_address_name ?? ''),
    phone: String(document.phone ?? '')
  };
}

/**
 * 카카오맵 장소(키워드) 검색.
 * SDK는 처음 검색할 때 한 번만 불러온다. 화면 코드는 search() 결과(이름·주소·전화)만 사용한다.
 */
export function createKakaoPlaceSearch({ javascriptKey, loadScript: load = loadScriptTag, getGlobal = () => globalThis.kakao } = {}) {
  const key = String(javascriptKey ?? '').trim();
  let sdkReady = null;

  function loadSdk() {
    sdkReady ??= load(`${SDK_URL}?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`)
      .then(() => new Promise(resolve => getGlobal().maps.load(resolve)))
      .catch(error => {
        sdkReady = null;
        throw error;
      });
    return sdkReady;
  }

  return Object.freeze({
    isConfigured: () => key !== '',

    async search(query) {
      const keyword = String(query ?? '').trim();
      if (!keyword) return [];
      if (!key) {
        throw new PlaceSearchError('카카오맵 키가 설정되지 않아 장소 검색을 사용할 수 없습니다. 관리자에게 문의해 주세요.', { code: 'KAKAO_KEY_MISSING' });
      }
      await loadSdk();
      const { services } = getGlobal().maps;
      return new Promise((resolve, reject) => {
        new services.Places().keywordSearch(keyword, (documents, status) => {
          if (status === services.Status.OK) resolve(documents.map(toPlace));
          else if (status === services.Status.ZERO_RESULT) resolve([]);
          else reject(new PlaceSearchError('장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
        });
      });
    }
  });
}
