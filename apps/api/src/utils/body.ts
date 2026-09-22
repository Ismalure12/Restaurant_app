import type { Request } from 'express';

// Mirrors Next's `await request.json()`: the raw body is kept as text (see
// app.ts) and parsed here, so an empty or malformed body THROWS inside the
// route — each route's own try/catch then answers with the exact status the
// Next handler did (500 for most, 400/401 for a few).
export function readJson<T = any>(req: Request): T {
  const raw = typeof req.body === 'string' ? req.body : '';
  return JSON.parse(raw) as T;
}
