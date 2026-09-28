import { defineSecret, defineString } from 'firebase-functions/params';

/**
 * 공급자 선택과 비밀값을 한 곳에서 선언합니다.
 * AI_PROVIDER_SECRETS 예시(Ollama): {"apiKey":"..."} 또는 API 키 원문
 */
export const AI_PROVIDER_SECRETS = defineSecret('AI_PROVIDER_SECRETS');
export const AI_PROVIDER = defineString('AI_PROVIDER', { default: 'ollama' });
export const AI_DEFAULT_MODEL = defineString('AI_DEFAULT_MODEL', { default: '' });
export const AI_ALLOWED_ORIGINS = defineString('AI_ALLOWED_ORIGINS', {
  default: 'https://minjun01145-ui.github.io'
});

export function readAiRuntimeConfig() {
  return {
    provider: AI_PROVIDER.value().trim() || 'ollama',
    defaultModel: AI_DEFAULT_MODEL.value().trim(),
    allowedOrigins: AI_ALLOWED_ORIGINS.value()
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  };
}

/**
 * Secret Manager 값을 provider 비밀값 객체로 바꿉니다.
 * JSON({"apiKey":"..."})과 API 키 원문을 모두 받습니다.
 */
export function parseProviderSecrets(rawValue) {
  const text = String(rawValue ?? '').trim();
  if (!text) return {};
  if (!text.startsWith('{')) return { apiKey: text };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('AI_PROVIDER_SECRETS 값을 JSON으로 읽을 수 없습니다.');
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}
