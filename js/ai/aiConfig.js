/**
 * 프런트엔드 AI 연결 설정.
 *
 * 이 파일에는 API 키나 비밀값을 절대 넣지 않습니다.
 * AI Functions 배포 전에는 비활성 상태를 유지합니다. 배포한 뒤 gatewayUrl을 설정하세요.
 */
export const aiConfig = Object.freeze({
  enabled: false,
  gatewayUrl: '',
  requestTimeoutMs: 45000,
  documentTimeoutMs: 120000
});
