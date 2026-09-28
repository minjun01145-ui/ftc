import { getCapability } from './capabilities/registry.js';
import { createProvider } from './providerFactory.js';
import { AiGatewayError } from './gatewayError.js';
import { AiProviderError } from './providerError.js';

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
    const provider = providerInstance ?? createProvider(runtimeConfig.provider, { secrets: readSecrets(providerSecrets) });
    const providerResponse = await generate(provider, providerRequest);
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

function readSecrets(providerSecrets) {
  try {
    return typeof providerSecrets === 'function' ? providerSecrets() : providerSecrets;
  } catch {
    throw new AiGatewayError(503, 'AI_SECRET_INVALID', 'AI 서버의 API 키 설정(AI_PROVIDER_SECRETS)을 읽을 수 없습니다.');
  }
}

async function generate(provider, request) {
  try {
    return await provider.generate(request);
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    throw providerGatewayError(error);
  }
}

function providerGatewayError(error) {
  if (error.status === 401 || error.status === 403) {
    return new AiGatewayError(502, 'AI_PROVIDER_AUTH_FAILED', 'AI 서버의 API 키가 올바르지 않습니다. AI_PROVIDER_SECRETS 값을 확인해 주세요.');
  }
  if (error.status === 404) {
    return new AiGatewayError(502, 'AI_MODEL_NOT_FOUND', `AI 모델(${error.model})을 찾을 수 없습니다. AI_DEFAULT_MODEL 값을 확인해 주세요.`);
  }
  if (error.status === 429) {
    return new AiGatewayError(503, 'AI_RATE_LIMITED', 'AI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return new AiGatewayError(502, 'AI_PROVIDER_ERROR', `문서 일정 분석에 실패했습니다. (AI 서버 응답 ${error.status || '오류'})`);
}
