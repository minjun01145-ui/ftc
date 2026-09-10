import { defaultState, normalizeState } from './presets.js';
import { clone } from './utils.js';
import { loadState, saveState } from './storage.js';

let state = normalizeState(loadState() ?? clone(defaultState));

export function getState() {
  return state;
}

export function updateState(mutator) {
  const next = clone(state);
  mutator(next);
  state = normalizeState(next);
  return state;
}

export function replaceState(next) {
  state = normalizeState(next);
  return state;
}

export function persistState() {
  saveState(state);
}
