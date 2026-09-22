import type { RequestHandler } from 'express';
import { requestContext, isDbDown } from '../lib/db/requestContext.js';
import { DB_DOWN_BODY } from './errorHandler.js';

// Every request gets a context; if the DB proved unreachable, a 500 the route
// built itself is upgraded to 503 DB_UNAVAILABLE just before it is sent.
export const withRequestContext: RequestHandler = (_req, res, next) => {
  requestContext.run({ dbDown: false }, () => {
    const json = res.json.bind(res);
    res.json = ((body?: unknown) => {
      if (res.statusCode === 500 && isDbDown()) { res.status(503); return json(DB_DOWN_BODY); }
      return json(body);
    }) as typeof res.json;
    next();
  });
};
