import { getCapability } from './capabilities/registry.js';
import { createProvider } from './providerFactory.js';

/**
 * AI 기능 실행의 유일한 서버 진입점.
 * 클라이언트가 임의의 prompt/model/provider를 직접 지정하지 못하도록 capability 기반으로 제한합니다.
 */
export async function executeCapability({ capabilityId, payload, runtimeConfig, providerSecrets }) {
  const capability = getCapability(capabilityId);
  if (!capability) {
    return {
      status: 404,
      body: {
        ok: false,
        error: {
          code: 'CAPABILITY_NOT_AVAILABLE',
          message: '현재 사용할 수 없는 AI 기능입니다.'
        }
      }
    };
  }

  const provider = createProvider(runtimeConfig.provider, { secrets: providerSecrets });
  const providerRequest = capability.buildRequest(payload, {
    defaultModel: runtimeConfig.defaultModel
  });
  const providerResponse = await provider.generate(providerRequest);
  const result = capability.normalizeResponse(providerResponse);

  return {
    status: 200,
    body: {
      ok: true,
      capability: capability.id,
      result
    }
  };
}
