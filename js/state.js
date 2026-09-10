import { defaultState } from './presets.js';
import { clone } from './utils.js';
import { loadState, saveState } from './storage.js';

let state = loadState() ?? clone(defaultState);
const listeners = new Set();

export function getState() { return state; }

export function setState(next) {
  state = next;
  saveState(state);
  for (const listener of listeners) listener(state);
}

export function update(mutator) {
  const next = clone(state);
  mutator(next);
  setState(next);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
