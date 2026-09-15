import { defineJsonSecret, defineString } from 'firebase-functions/params';

/**
 * 공급자 선택과 비밀값을 한 곳에서 선언합니다.
 * AI_PROVIDER_SECRETS 예시(Ollama): {"apiKey":"..."}
 */
export const AI_PROVIDER_SECRETS = defineJsonSecret('AI_PROVIDER_SECRETS');
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
