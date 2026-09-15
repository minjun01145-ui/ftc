import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCapability } from '../src/ai/gateway.js';
import { listCapabilities } from '../src/ai/capabilities/registry.js';


test('기반 버전에는 실제 AI capability가 등록되어 있지 않다', () => {
  assert.deepEqual(listCapabilities(), []);
});


test('등록되지 않은 capability는 provider를 호출하지 않고 404를 반환한다', async () => {
  const result = await executeCapability({
    capabilityId: 'budget-review',
    payload: {},
    runtimeConfig: { provider: 'ollama', defaultModel: '' },
    providerSecrets: {}
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.error.code, 'CAPABILITY_NOT_AVAILABLE');
});
