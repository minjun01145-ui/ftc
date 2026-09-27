import { tripScheduleFromDocument } from './tripScheduleFromDocument.js';

const capabilities = new Map([[tripScheduleFromDocument.id, tripScheduleFromDocument]]);

export function getCapability(id) {
  return capabilities.get(id) ?? null;
}

export function listCapabilities() {
  return [...capabilities.keys()];
}
