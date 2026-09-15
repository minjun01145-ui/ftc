export function applyCors(req, res, allowedOrigins) {
  const origin = String(req.get?.('origin') || req.headers?.origin || '');
  const allowed = !origin || allowedOrigins.includes(origin);

  if (origin && allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    if (!allowed) {
      res.status(403).json(errorBody('ORIGIN_NOT_ALLOWED', '허용되지 않은 출처입니다.'));
      return true;
    }
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return true;
  }

  if (!allowed) {
    res.status(403).json(errorBody('ORIGIN_NOT_ALLOWED', '허용되지 않은 출처입니다.'));
    return true;
  }

  return false;
}

function errorBody(code, message) {
  return { ok: false, error: { code, message } };
}
