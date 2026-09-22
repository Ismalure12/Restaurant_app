import { Router, type Express } from 'express';
import authRoutes from './auth.routes.js';
import publicRoutes from './public.routes.js';
import catalogRoutes from './catalog.routes.js';
import usersRoutes from './users.routes.js';
import sellRoutes from './admin/sell.routes.js';
import moneyRoutes from './admin/money.routes.js';
import backOfficeRoutes from './admin/backOffice.routes.js';
import insightsRoutes from './admin/insights.routes.js';

// Every API endpoint lives under /api; staff back-office endpoints under /api/admin.
// Each *.routes.ts file maps its URLs to controller handlers (see defineRoute).
export function registerRoutes(app: Express) {
  const admin = Router();
  admin.use(sellRoutes, moneyRoutes, backOfficeRoutes, insightsRoutes);

  const api = Router();
  api.use('/admin', admin);
  api.use(authRoutes, publicRoutes, catalogRoutes, usersRoutes);

  app.use('/api', api);
}
