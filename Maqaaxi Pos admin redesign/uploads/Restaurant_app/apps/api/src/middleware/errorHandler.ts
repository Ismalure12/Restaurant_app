import type { ErrorRequestHandler, RequestHandler } from 'express';
import { isDbDown } from '../lib/db/requestContext.js';

export const DB_DOWN_BODY = { error: 'The server can’t reach its database right now. Please try again in a moment.', code: 'DB_UNAVAILABLE' };

// Unknown path: an empty 404.
export const notFound: RequestHandler = (_req, res) => {
  res.status(404).end();
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Body-parser failures carry their own 4xx (e.g. 413 payload too large).
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(`${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return;
  if (status === 500 && isDbDown()) return res.status(503).json(DB_DOWN_BODY);
  // An uncaught route error is an empty 500 — never leak internals.
  res.status(status).end();
};
