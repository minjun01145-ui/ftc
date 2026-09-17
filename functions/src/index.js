import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  AI_PROVIDER_SECRETS,
  readAiRuntimeConfig
} from './config/aiParams.js';
import { listCapabilities } from './ai/capabilities/registry.js';
import { executeCapability } from './ai/gateway.js';
import { applyCors } from './security/originGuard.js';
import { validateGatewayRequest } from './security/requestGuard.js';
import { sendInternalError, sendJson } from './http/respond.js';

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
    providerConfigured: Boolean(config.provider),
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
        providerSecrets: AI_PROVIDER_SECRETS.value()
      });
      sendJson(res, outcome.status, outcome.body);
    } catch (error) {
      logger.error('AI gateway error', error);
      sendInternalError(res);
    }
  }
);
