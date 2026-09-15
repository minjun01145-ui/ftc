/**
 * 복사해서 사용할 capability 예시 골격입니다. 현재 registry에는 등록되어 있지 않습니다.
 *
 * capability는 사용자 payload를 검증하고 provider 요청을 구성하며,
 * provider 응답을 프로그램 공통 형식으로 정규화하는 역할만 담당합니다.
 */
export const exampleCapability = Object.freeze({
  id: 'example',

  buildRequest(payload, { defaultModel }) {
    void payload;
    return {
      model: defaultModel,
      messages: []
    };
  },

  normalizeResponse(providerResponse) {
    return { text: providerResponse.text };
  }
});
