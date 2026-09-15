/**
 * 외부에서 호출 가능한 AI 기능 목록입니다.
 * 현재 대회 기반 버전에는 의도적으로 아무 기능도 등록하지 않습니다.
 *
 * 실제 기능을 만들 때만 capability 모듈을 추가하고 아래 Map에 등록하세요.
 */
const capabilities = new Map();

export function getCapability(id) {
  return capabilities.get(id) ?? null;
}

export function listCapabilities() {
  return [...capabilities.keys()];
}
