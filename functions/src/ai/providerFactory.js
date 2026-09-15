import { createOllamaProvider } from './providers/ollamaProvider.js';

const factories = new Map([
  ['ollama', ({ secrets }) => createOllamaProvider({ apiKey: secrets?.apiKey })]
]);

/**
 * 공급자 선택 지점은 이 파일 하나입니다.
 * 교육청 API 도입 시 providers/educationOfficeProvider.js를 만들고 여기에 등록하면 됩니다.
 */
export function createProvider(providerId, context = {}) {
  const factory = factories.get(String(providerId ?? '').trim());
  if (!factory) throw new Error(`지원하지 않는 AI provider입니다: ${providerId}`);
  return factory(context);
}

export function listProviderIds() {
  return [...factories.keys()];
}
