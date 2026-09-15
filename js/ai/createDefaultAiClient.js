import { aiConfig } from './aiConfig.js';
import { createAiClient } from './aiClient.js';
import { createHttpAiTransport } from './transports/httpTransport.js';

/**
 * 향후 화면에서 AI를 사용할 때 이 팩토리만 가져다 쓰면 됩니다.
 * 현재 애플리케이션에서는 의도적으로 import하지 않습니다.
 */
export function createDefaultAiClient() {
  const transport = aiConfig.gatewayUrl
    ? createHttpAiTransport({
        baseUrl: aiConfig.gatewayUrl,
        timeoutMs: aiConfig.requestTimeoutMs
      })
    : null;

  return createAiClient({ enabled: aiConfig.enabled, transport });
}
