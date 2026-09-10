/**
 * 학교알리미 연동을 위한 교체 지점입니다.
 * GitHub Pages에 인증키를 직접 넣지 않기 위해 MVP에서는 호출하지 않습니다.
 * 추후 Cloudflare Worker 등의 서버리스 프록시에서 학교알리미 Open API를 호출한 뒤
 * 이 함수가 해당 프록시를 사용하도록 구현하면 됩니다.
 */
export async function searchSchools() {
  throw new Error('학교알리미 연동은 아직 설정되지 않았습니다. 현재 버전에서는 학교 정보를 직접 입력해 주세요.');
}
