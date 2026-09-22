import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from './routes/index.js';
import { withRequestContext } from './middleware/requestContext.js';
import { rateLimit } from './middleware/rateLimit.js';
import { businessDay } from './middleware/businessDay.js';
import { nudgeOrdersOnWrite } from './middleware/orderEvents.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// Body is kept as raw text and parsed per route by readJson() (utils/body.ts)
// so a missing or malformed JSON body fails inside the route that reads it.
// Multipart (image upload) is left untouched for multer.
const isMultipart = (req: express.Request) =>
  String(req.headers['content-type'] ?? '').toLowerCase().startsWith('multipart/');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // No ETags / 304s: Express would add them to every GET and change caching
  // behaviour for live admin data.
  app.set('etag', false);

  app.use(withRequestContext);

  // Behind nginx the client IP is in X-Forwarded-For (one hop). Only trust it
  // when a proxy is really in front, or anyone could fake an IP past the rate
  // limits: TRUST_PROXY=1 (production default) / 0 when the API is exposed directly.
  const trustProxy = Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 1 : 0));
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  // Public payment endpoints (middleware/rateLimit.ts): per IP, generous for shared restaurant Wi-Fi.
  app.use('/api/checkout', rateLimit({ name: 'checkout', max: 30, windowMs: 10 * 60_000 }));
  app.use('/api/payment/initiate', rateLimit({ name: 'payment/initiate', max: 30, windowMs: 10 * 60_000 }));
  app.use('/api/payment/status', rateLimit({ name: 'payment/status', max: 60, windowMs: 60_000 }));

  app.use(cookieParser());
  app.use(express.text({ type: (req) => !isMultipart(req as express.Request), limit: '1mb' }));

  app.use(businessDay);
  app.use(['/api/admin/pos', '/api/admin/orders'], nudgeOrdersOnWrite);

  registerRoutes(app);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
