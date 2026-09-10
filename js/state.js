import { defaultProject } from './presets.js';
import { clone } from './utils.js';
import { loadProject, saveProject } from './storage.js';

let state = loadProject() ?? clone(defaultProject);
const listeners = new Set();

export function getState() { return state; }

export function setState(next) {
  state = next;
  saveProject(state);
  for (const listener of listeners) listener(state);
}

export function update(mutator) {
  const next = clone(state);
  mutator(next);
  setState(next);
}

export function resetState() {
  setState(clone(defaultProject));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
