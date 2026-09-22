import type { Request } from 'express';

// Same semantics as Next's `new URL(request.url).searchParams` (flat
// URLSearchParams — no qs array/object parsing).
export function searchParams(req: Request): URLSearchParams {
  return new URL(req.originalUrl, 'http://localhost').searchParams;
}
