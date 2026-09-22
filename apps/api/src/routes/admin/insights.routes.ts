// /api/admin — Insights and system: reports, the Overview, global search,
// settings, staff access (permissions) and the audit log.
// Fixed paths are listed before their :param siblings.
import { Router } from 'express';
import { defineRoute } from '../defineRoute.js';
import { getSalesReport, getInventoryReport, getInventoryMovementsReport, getFinancialReport, getEmployeesReport, getEmployeeReport, getMenuReport } from '../../controllers/admin/reports.controller.js';
import { getOverview } from '../../controllers/admin/overview.controller.js';
import { search } from '../../controllers/admin/search.controller.js';
import { getSettings, updateSettings } from '../../controllers/admin/settings.controller.js';
import { getPermissions, listAuditLog, updatePermissions } from '../../controllers/admin/access.controller.js';

const router = Router();

defineRoute(router, '/reports/sales', { GET: getSalesReport });
defineRoute(router, '/reports/inventory', { GET: getInventoryReport });
defineRoute(router, '/reports/inventory/movements', { GET: getInventoryMovementsReport });
defineRoute(router, '/reports/financial', { GET: getFinancialReport });
defineRoute(router, '/reports/employees', { GET: getEmployeesReport });
defineRoute(router, '/reports/employees/:id', { GET: getEmployeeReport });
defineRoute(router, '/reports/menu', { GET: getMenuReport });
defineRoute(router, '/overview', { GET: getOverview });
defineRoute(router, '/search', { GET: search });
defineRoute(router, '/settings', { GET: getSettings, PUT: updateSettings });
defineRoute(router, '/permissions', { GET: getPermissions, PUT: updatePermissions });
defineRoute(router, '/audit-log', { GET: listAuditLog });

export default router;
