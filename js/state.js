import { defaultState, normalizeState } from './presets.js';
import { clone } from './utils.js';
import { syncSharedCounts } from './sharedCosts.js';
import { loadState, saveState } from './storage.js';

// 다른 학년과 함께 계산하는 기타비는 연결한 사업의 현재 인원으로 늘 다시 센다.
const prepare = value => syncSharedCounts(normalizeState(value));

let state = prepare(loadState() ?? clone(defaultState));

export function getState() {
  return state;
}

export function updateState(mutator) {
  const next = clone(state);
  mutator(next);
  state = prepare(next);
  return state;
}

export function replaceState(next) {
  state = prepare(next);
  return state;
}

export function persistState() {
  saveState(state);
}
