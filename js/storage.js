const KEY = 'fieldtrip-budget-mvp:v2';
const OLD_KEY = 'fieldtrip-budget-mvp:v1';

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadState() {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return migrateV1();
}

function migrateV1() {
  const raw = localStorage.getItem(OLD_KEY);
  if (!raw) return null;
  try {
    const old = JSON.parse(raw);
    if (!old?.meta) return null;
    return {
      schemaVersion: 2,
      school: {
        name: old.meta.schoolName ?? '',
        homepage: old.meta.schoolUrl ?? '',
        schoolYear: old.meta.schoolYear ?? new Date().getFullYear(),
        grade1Students: 0,
        grade2Students: 0,
        grade3Students: 0
      },
      projects: []
    };
  } catch {
    return null;
  }
}
