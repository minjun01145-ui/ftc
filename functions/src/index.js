import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { SCHOOL_DATA_API_KEYS } from './config/schoolDataParams.js';
import { sendJson } from './http/respond.js';
import { SchoolDataError } from './schoolData/errors.js';
import { executeSchoolDataAction } from './schoolData/index.js';
import { applySchoolOriginGuard } from './security/schoolOriginGuard.js';

setGlobalOptions({ region: 'asia-northeast3', maxInstances: 3 });

export const schoolInfoGateway = onRequest(
  {
    cors: false,
    secrets: [SCHOOL_DATA_API_KEYS],
    timeoutSeconds: 45,
    memory: '256MiB'
  },
  async (req, res) => {
    if (applySchoolOriginGuard(req, res)) return;
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 허용됩니다.' } });
      return;
    }

    const contentLength = Number(req.get?.('content-length') || req.headers?.['content-length'] || 0);
    if (Number.isFinite(contentLength) && contentLength > 4096) {
      sendJson(res, 413, { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: '요청 크기가 너무 큽니다.' } });
      return;
    }

    try {
      const result = await executeSchoolDataAction(req.body, SCHOOL_DATA_API_KEYS.value());
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      if (error instanceof SchoolDataError) {
        sendJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } });
        return;
      }
      logger.error('School data gateway error');
      sendJson(res, 500, {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '학교 정보 서버 처리 중 오류가 발생했습니다.' }
      });
    }
  }
);
