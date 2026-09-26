import { defineString } from 'firebase-functions/params';

const SCHOOL_INFO_ALLOWED_ORIGINS = defineString('SCHOOL_INFO_ALLOWED_ORIGINS', {
  default: 'https://minjun01145-ui.github.io'
});

export function applySchoolOriginGuard(req, res) {
  const origin = String(req.get?.('origin') || req.headers?.origin || '');
  const allowedOrigins = SCHOOL_INFO_ALLOWED_ORIGINS.value()
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const allowed = !origin || allowedOrigins.includes(origin);

  if (origin && allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    if (!allowed) {
      sendOriginError(res);
      return true;
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return true;
  }

  if (!allowed) {
    sendOriginError(res);
    return true;
  }

  return false;
}

function sendOriginError(res) {
  res.status(403).json({
    ok: false,
    error: { code: 'ORIGIN_NOT_ALLOWED', message: '허용되지 않은 출처입니다.' }
  });
}
