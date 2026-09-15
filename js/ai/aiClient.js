import { AiNotConfiguredError } from './aiErrors.js';

/**
 * UI와 특정 AI 공급자를 분리하는 프런트엔드 경계입니다.
 * 화면 코드에서는 Ollama/Firebase를 직접 호출하지 않고 이 객체만 사용합니다.
 */
export function createAiClient({ enabled = false, transport } = {}) {
  return Object.freeze({
    isEnabled() {
      return Boolean(enabled && transport);
    },

    async health() {
      assertConfigured(enabled, transport);
      return transport.health();
    },

    async invoke(capability, payload = {}) {
      assertConfigured(enabled, transport);
      if (!capability || typeof capability !== 'string') {
        throw new TypeError('capability는 비어 있지 않은 문자열이어야 합니다.');
      }
      return transport.invoke(capability, payload);
    }
  });
}

function assertConfigured(enabled, transport) {
  if (!enabled || !transport) throw new AiNotConfiguredError();
}
