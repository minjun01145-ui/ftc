export function sendJson(res, status, body) {
  res.status(status).set('Content-Type', 'application/json; charset=utf-8').json(body);
}

export function sendInternalError(res) {
  sendJson(res, 500, {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'AI 서버 처리 중 오류가 발생했습니다.'
    }
  });
}
