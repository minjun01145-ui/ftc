const MAX_CONTENT_LENGTH = 64 * 1024;

export function validateGatewayRequest(req) {
  if (req.method !== 'POST') {
    return failure(405, 'METHOD_NOT_ALLOWED', 'POST 요청만 허용됩니다.');
  }

  const contentLength = Number(req.get?.('content-length') || req.headers?.['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return failure(413, 'PAYLOAD_TOO_LARGE', '요청 크기가 너무 큽니다.');
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return failure(400, 'INVALID_BODY', 'JSON 객체가 필요합니다.');
  }

  const capability = String(req.body.capability ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(capability)) {
    return failure(400, 'INVALID_CAPABILITY', '올바른 capability가 필요합니다.');
  }

  const payload = req.body.payload ?? {};
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return failure(400, 'INVALID_PAYLOAD', 'payload는 JSON 객체여야 합니다.');
  }

  return { ok: true, capability, payload };
}

function failure(status, code, message) {
  return { ok: false, status, error: { code, message } };
}
