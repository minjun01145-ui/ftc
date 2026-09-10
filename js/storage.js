const KEY = 'fieldtrip-budget-mvp:v1';

export function saveProject(project) {
  localStorage.setItem(KEY, JSON.stringify(project));
}

export function loadProject() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function clearProject() {
  localStorage.removeItem(KEY);
}
