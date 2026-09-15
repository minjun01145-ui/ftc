/**
 * 프런트엔드 AI 연결 설정.
 *
 * 이 파일에는 API 키나 비밀값을 절대 넣지 않습니다.
 * Firebase Functions를 배포한 뒤 gatewayUrl만 설정하면 됩니다.
 */
export const aiConfig = Object.freeze({
  enabled: false,
  gatewayUrl: '',
  requestTimeoutMs: 45000
});
