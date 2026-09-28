/**
 * 프런트엔드 AI 연결 설정.
 *
 * 이 파일에는 API 키나 비밀값을 절대 넣지 않습니다.
 * ftc1-6b064 프로젝트의 AI Functions(asia-northeast3) 공통 주소입니다.
 */
export const aiConfig = Object.freeze({
  enabled: true,
  gatewayUrl: 'https://asia-northeast3-ftc1-6b064.cloudfunctions.net',
  requestTimeoutMs: 45000,
  documentTimeoutMs: 120000
});
