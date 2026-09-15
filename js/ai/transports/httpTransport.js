import { AiError } from '../aiErrors.js';

function normalizeBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

export function createHttpAiTransport({ baseUrl, timeoutMs = 45000, fetchImpl = fetch } = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  return Object.freeze({
    async health() {
      if (!normalizedBaseUrl) {
        throw new AiError('AI gateway URL이 설정되지 않았습니다.', { code: 'AI_GATEWAY_URL_MISSING' });
      }
      return requestJson(fetchImpl, `${normalizedBaseUrl}/aiHealth`, {
        method: 'GET',
        timeoutMs
      });
    },

    async invoke(capability, payload = {}) {
      if (!normalizedBaseUrl) {
        throw new AiError('AI gateway URL이 설정되지 않았습니다.', { code: 'AI_GATEWAY_URL_MISSING' });
      }
      return requestJson(fetchImpl, `${normalizedBaseUrl}/aiGateway`, {
        method: 'POST',
        timeoutMs,
        body: { capability, payload }
      });
    }
  });
}

async function requestJson(fetchImpl, url, { method, timeoutMs, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const data = await readJsonSafely(response);
    if (!response.ok) {
      throw new AiError(data?.error?.message || `AI 요청 실패 (${response.status})`, {
        code: data?.error?.code || 'AI_HTTP_ERROR',
        status: response.status
      });
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AiError('AI 요청 시간이 초과되었습니다.', { code: 'AI_TIMEOUT', cause: error });
    }
    if (error instanceof AiError) throw error;
    throw new AiError('AI 서버에 연결할 수 없습니다.', { code: 'AI_NETWORK_ERROR', cause: error });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}
