export const won = new Intl.NumberFormat('ko-KR', {
  style: 'currency', currency: 'KRW', maximumFractionDigits: 0
});

export function formatWon(value) {
  if (!Number.isFinite(Number(value))) return '-';
  return won.format(Number(value));
}

export function number(value, fallback = 0) {
  const n = Number(String(value ?? '').replaceAll(',', ''));
  return Number.isFinite(n) ? n : fallback;
}

export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function clone(value) {
  return typeof structuredClone !== 'undefined' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
