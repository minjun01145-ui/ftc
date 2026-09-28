import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCapability } from '../src/ai/gateway.js';
import { listCapabilities } from '../src/ai/capabilities/registry.js';


test('문서 일정 capability만 registry에 등록한다', () => {
  assert.deepEqual(listCapabilities(), ['trip-schedule-from-document']);
});


test('등록되지 않은 capability는 provider를 호출하지 않고 404를 반환한다', async () => {
  const result = await executeCapability({
    capabilityId: 'not-registered',
    payload: {},
    runtimeConfig: { provider: 'ollama', defaultModel: '' },
    providerSecrets: {}
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.error.code, 'CAPABILITY_NOT_AVAILABLE');
});


test('AI_PROVIDER_SECRETS는 JSON과 API 키 원문을 모두 받는다', async () => {
  const { parseProviderSecrets } = await import('../src/config/aiParams.js');
  assert.deepEqual(parseProviderSecrets('{"apiKey":"k1"}'), { apiKey: 'k1' });
  assert.deepEqual(parseProviderSecrets('  raw-key  '), { apiKey: 'raw-key' });
  assert.deepEqual(parseProviderSecrets(''), {});
  assert.throws(() => parseProviderSecrets('{broken'));
});


for (const [status, code] of [[401, 'AI_PROVIDER_AUTH_FAILED'], [404, 'AI_MODEL_NOT_FOUND'], [429, 'AI_RATE_LIMITED'], [500, 'AI_PROVIDER_ERROR']]) {
  test(`Ollama ${status} 응답은 ${code}로 알려준다`, async () => {
    const { createOllamaProvider } = await import('../src/ai/providers/ollamaProvider.js');
    const provider = createOllamaProvider({
      apiKey: 'test-key',
      fetchImpl: async () => new Response(JSON.stringify({ error: 'failure' }), { status })
    });
    const result = await executeCapability({
      capabilityId: 'trip-schedule-from-document',
      payload: { documentText: '5월 13일 롯데월드' },
      runtimeConfig: { provider: 'ollama', defaultModel: 'model-test' },
      documentRequest: true,
      providerInstance: provider
    });
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, code);
    assert.doesNotMatch(result.body.error.message, /test-key/);
  });
}


test('잘못된 비밀값은 AI_SECRET_INVALID로 알려준다', async () => {
  const result = await executeCapability({
    capabilityId: 'trip-schedule-from-document',
    payload: { documentText: '5월 13일 롯데월드' },
    runtimeConfig: { provider: 'ollama', defaultModel: 'model-test' },
    documentRequest: true,
    providerSecrets() { throw new Error('bad json'); }
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'AI_SECRET_INVALID');
});


test('Ollama 요청에 JSON 형식을 지정한다', async () => {
  const { createOllamaProvider } = await import('../src/ai/providers/ollamaProvider.js');
  let sent;
  const provider = createOllamaProvider({
    apiKey: 'test-key',
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ message: { content: '{"items":[]}' } }), { status: 200 });
    }
  });
  const result = await executeCapability({
    capabilityId: 'trip-schedule-from-document',
    payload: { documentText: '5월 13일 롯데월드' },
    runtimeConfig: { provider: 'ollama', defaultModel: 'model-test' },
    documentRequest: true,
    providerInstance: provider
  });
  assert.equal(result.status, 200);
  assert.equal(sent.format, 'json');
  assert.equal(sent.model, 'model-test');
});
