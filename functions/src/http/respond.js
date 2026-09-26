export function sendJson(res, status, body) {
  res.status(status).set('Content-Type', 'application/json; charset=utf-8').json(body);
}
