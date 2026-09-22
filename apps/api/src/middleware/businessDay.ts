import type { RequestHandler } from 'express';
import prisma from '../lib/db/prisma.js';
import { refreshBusinessDayEnd } from '../lib/time/businessTime.js';

// Every day-key in a request uses the business day's end hour (Settings › Business).
export const businessDay: RequestHandler = (_req, _res, next) => {
  refreshBusinessDayEnd(prisma).then(() => next(), next);
};
