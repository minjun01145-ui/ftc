import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAiProvider } from '../src/ai/providerContract.js';


test('AI provider 계약은 id와 generate를 요구한다', () => {
  assert.throws(() => assertAiProvider({ id: 'x' }), TypeError);
  const provider = assertAiProvider({ id: 'x', generate: async () => ({ text: '' }) });
  assert.equal(provider.id, 'x');
});
