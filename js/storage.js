// 이 브라우저 안(localStorage)에만 저장한다.
const KEY = 'fieldtrip-cost-manager:v1';

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
