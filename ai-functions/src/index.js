import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import {
  AI_PROVIDER_SECRETS,
  parseProviderSecrets,
  readAiRuntimeConfig
} from './config/aiParams.js';
import { listCapabilities } from './ai/capabilities/registry.js';
import { executeCapability } from './ai/gateway.js';
import { applyCors } from './security/originGuard.js';
import { validateGatewayRequest } from './security/requestGuard.js';
import { sendInternalError, sendJson } from './http/respond.js';
import { DocumentRequestError, executeDocumentRequest } from './ai/documentGateway.js';
import { DocumentProcessingError } from './documents/extractText.js';

setGlobalOptions({ region: 'asia-northeast3', maxInstances: 3 });

export const aiHealth = onRequest({ cors: false }, (req, res) => {
  const config = readAiRuntimeConfig();
  if (applyCors(req, res, config.allowedOrigins)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 허용됩니다.' } });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    service: 'ftc-ai-gateway',
    providerConfigured: Boolean(config.provider && config.defaultModel),
    modelConfigured: Boolean(config.defaultModel),
    capabilities: listCapabilities()
  });
});

export const aiGateway = onRequest(
  {
    cors: false,
    secrets: [AI_PROVIDER_SECRETS],
    timeoutSeconds: 60,
    memory: '256MiB'
  },
  async (req, res) => {
    const config = readAiRuntimeConfig();
    if (applyCors(req, res, config.allowedOrigins)) return;

    const validation = validateGatewayRequest(req);
    if (!validation.ok) {
      sendJson(res, validation.status, { ok: false, error: validation.error });
      return;
    }

    try {
      const outcome = await executeCapability({
        capabilityId: validation.capability,
        payload: validation.payload,
        runtimeConfig: config,
        providerSecrets: () => parseProviderSecrets(AI_PROVIDER_SECRETS.value())
      });
      sendJson(res, outcome.status, outcome.body);
    } catch (error) {
      logger.error('AI gateway error', error);
      sendInternalError(res);
    }
  }
);

export const aiDocumentGateway = onRequest(
  {
    cors: false,
    secrets: [AI_PROVIDER_SECRETS],
    timeoutSeconds: 120,
    memory: '1GiB'
  },
  async (req, res) => {
    const config = readAiRuntimeConfig();
    if (applyCors(req, res, config.allowedOrigins)) return;

    try {
      const outcome = await executeDocumentRequest(req, {
        runtimeConfig: config,
        providerSecrets: () => parseProviderSecrets(AI_PROVIDER_SECRETS.value())
      });
      if (!outcome.body?.ok) logger.warn('AI document gateway rejected', { status: outcome.status, code: outcome.body?.error?.code, message: outcome.body?.error?.message });
      sendJson(res, outcome.status, outcome.body);
    } catch (error) {
      if (error instanceof DocumentRequestError || error instanceof DocumentProcessingError) {
        sendJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } });
        return;
      }
      const missingConfiguration = String(error?.message ?? '').includes('API 키가 설정되지 않았습니다');
      const code = missingConfiguration ? 'AI_NOT_CONFIGURED' : 'AI_PROVIDER_ERROR';
      const status = missingConfiguration ? 503 : 502;
      const message = missingConfiguration
        ? '문서 일정 가져오기에 필요한 AI 서버 설정이 완료되지 않았습니다.'
        : '문서 일정 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.';
      logger.error('AI document gateway failed', { code, message: String(error?.message ?? '').slice(0, 300) });
      sendJson(res, status, { ok: false, error: { code, message } });
    }
  }
);
