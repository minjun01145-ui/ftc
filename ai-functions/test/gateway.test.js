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
