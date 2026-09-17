export const TRIP_SCHEDULE_FILE_ACCEPT = '.pdf,.jpg,.jpeg,application/pdf,image/jpeg';

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg']);
const ALLOWED_FILE_NAME = /\.(pdf|jpe?g)$/i;

export function isSupportedScheduleFile(file) {
  if (!file) return false;
  const type = String(file.type ?? '').toLowerCase();
  const name = String(file.name ?? '');
  return ALLOWED_MIME_TYPES.has(type) || ALLOWED_FILE_NAME.test(name);
}

export function validateScheduleFiles(fileList) {
  const files = Array.from(fileList ?? []);
  return {
    accepted: files.filter(isSupportedScheduleFile),
    rejected: files.filter(file => !isSupportedScheduleFile(file))
  };
}
