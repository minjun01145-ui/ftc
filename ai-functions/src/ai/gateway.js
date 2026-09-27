import { getCapability } from './capabilities/registry.js';
import { createProvider } from './providerFactory.js';
import { AiGatewayError } from './gatewayError.js';

/**
 * AI 기능 실행의 유일한 서버 진입점.
 * 클라이언트가 임의의 prompt/model/provider를 직접 지정하지 못하도록 capability 기반으로 제한합니다.
 */
export async function executeCapability({ capabilityId, payload, runtimeConfig, providerSecrets, documentRequest = false, providerInstance }) {
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

  if (Boolean(capability.documentOnly) !== Boolean(documentRequest)) {
    return {
      status: 400,
      body: { ok: false, error: { code: 'CAPABILITY_TRANSPORT_MISMATCH', message: '이 기능은 문서 업로드 요청으로만 사용할 수 있습니다.' } }
    };
  }

  try {
    const providerRequest = capability.buildRequest(payload, { defaultModel: runtimeConfig.defaultModel });
    const secrets = typeof providerSecrets === 'function' ? providerSecrets() : providerSecrets;
    const provider = providerInstance ?? createProvider(runtimeConfig.provider, { secrets });
    const providerResponse = await provider.generate(providerRequest);
    const result = capability.normalizeResponse(providerResponse);

    return {
      status: 200,
      body: { ok: true, capability: capability.id, result }
    };
  } catch (error) {
    if (error instanceof AiGatewayError) {
      return { status: error.status, body: { ok: false, error: { code: error.code, message: error.message } } };
    }
    throw error;
  }
}
