import test from 'node:test';
import assert from 'node:assert/strict';
import { createKakaoPlaceSearch } from '../js/services/kakaoPlaces.js';
import { importSourceText } from '../js/views/project/tripScheduleSection.js';

function fakeKakao(documents, status = 'OK') {
  const Status = { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' };
  return {
    maps: {
      load: callback => callback(),
      services: {
        Status,
        Places: class {
          keywordSearch(query, callback) { callback(documents, Status[status]); }
        }
      }
    }
  };
}

test('키가 없으면 SDK를 불러오지 않고 설정 안내 오류를 낸다', async () => {
  let loaded = false;
  const search = createKakaoPlaceSearch({ javascriptKey: '', loadScript: async () => { loaded = true; } });
  assert.equal(search.isConfigured(), false);
  await assert.rejects(search.search('경복궁'), error => error.code === 'KAKAO_KEY_MISSING');
  assert.equal(loaded, false);
});

test('카카오 장소 검색 결과를 이름·주소·전화로 바꾸고 SDK는 한 번만 불러온다', async () => {
  const urls = [];
  const kakao = fakeKakao([{ place_name: '경복궁', address_name: '서울 종로구 세종로 1-1', road_address_name: '서울 종로구 사직로 161', phone: '02-3700-3900' }]);
  const search = createKakaoPlaceSearch({ javascriptKey: 'test-key', loadScript: async url => { urls.push(url); }, getGlobal: () => kakao });

  const first = await search.search('경복궁');
  await search.search('경복궁');
  assert.deepEqual(first, [{ name: '경복궁', address: '서울 종로구 세종로 1-1', roadAddress: '서울 종로구 사직로 161', phone: '02-3700-3900' }]);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /appkey=test-key&libraries=services&autoload=false/);
});

test('검색 결과가 없으면 빈 목록을 돌려준다', async () => {
  const search = createKakaoPlaceSearch({ javascriptKey: 'k', loadScript: async () => {}, getGlobal: () => fakeKakao([], 'ZERO_RESULT') });
  assert.deepEqual(await search.search('없는곳'), []);
});

test('일정 기준 문구에 불러온 시각과 파일명을 표시한다', () => {
  const text = importSourceText({ filename: '일정.pdf', importedAt: new Date(2026, 8, 28, 14, 3).toISOString() });
  assert.equal(text, "2026-09-28 14:03에 불러온 문서 '일정.pdf' 기준 일정입니다.");
  assert.equal(importSourceText(null), '');
});
