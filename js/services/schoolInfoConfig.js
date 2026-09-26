/**
 * Firebase Functions 주소만 설정합니다. 학교알리미 인증키는
 * 브라우저에 두지 않고 Functions Secret Manager에 보관합니다.
 */
export const schoolInfoConfig = Object.freeze({
  gatewayUrl: '',
  requestTimeoutMs: 45000
});
