import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiClient } from '../js/ai/aiClient.js';
import { createHttpAiTransport } from '../js/ai/transports/httpTransport.js';

test('multipart 문서 요청은 전용 endpoint와 FormData를 사용하고 Content-Type을 직접 지정하지 않는다', async () => {
  let request;
  const transport = createHttpAiTransport({
    baseUrl: 'https://example.test/functions/',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { items: [] } }) };
    }
  });
  const file = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  Object.defineProperty(file, 'name', { value: 'trip.pdf' });

  await transport.invokeDocument('trip-schedule-from-document', file, { projectTitle: '2학년 수학여행' });

  assert.equal(request.url, 'https://example.test/functions/aiDocumentGateway');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers, undefined);
  assert.ok(request.options.body instanceof FormData);
  assert.equal(request.options.body.get('capability'), 'trip-schedule-from-document');
  assert.deepEqual(JSON.parse(request.options.body.get('payload')), { projectTitle: '2학년 수학여행' });
  assert.equal(request.options.body.get('file').name, 'trip.pdf');
});

test('기존 JSON invoke는 aiGateway JSON transport 그대로 사용한다', async () => {
  let request;
  const transport = createHttpAiTransport({
    baseUrl: 'https://example.test/functions',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, text: async () => '{"ok":true}' };
    }
  });

  await transport.invoke('legacy-capability', { value: 1 });

  assert.equal(request.url, 'https://example.test/functions/aiGateway');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), { capability: 'legacy-capability', payload: { value: 1 } });
});

test('AI가 설정되지 않았을 때 문서 기능은 AI_NOT_CONFIGURED로 거절한다', async () => {
  const client = createAiClient({ enabled: false, transport: null });
  await assert.rejects(
    client.invokeDocument('trip-schedule-from-document', new Blob(['x'])),
    error => error.code === 'AI_NOT_CONFIGURED'
  );
});
