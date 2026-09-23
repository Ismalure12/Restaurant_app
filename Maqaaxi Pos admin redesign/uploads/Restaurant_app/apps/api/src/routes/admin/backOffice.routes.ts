// /api/admin — Back office: inventory, stock counts, payroll, the waiter list and "my" performance/salary.
// Fixed paths are listed before their :param siblings.
import { Router } from 'express';
import { defineRoute } from '../defineRoute.js';
import { listInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, recordStockMovement } from '../../controllers/admin/inventory.controller.js';
import { listStockCounts, createStockCount, getStockCount, updateStockCount, deleteStockCount, postStockCount } from '../../controllers/admin/stockCounts.controller.js';
import { listPayroll, paySalaries, changeSalaryRates, deleteSalaryRate, getStaffPayroll, undoSalaryPayment } from '../../controllers/admin/payroll.controller.js';
import { getMyPerformance, getMySalary } from '../../controllers/admin/me.controller.js';
import { listWaiters } from '../../controllers/admin/waiters.controller.js';

const router = Router();

defineRoute(router, '/inventory', { GET: listInventory, POST: createInventoryItem });
defineRoute(router, '/inventory/:id', { PATCH: updateInventoryItem, DELETE: deleteInventoryItem });
defineRoute(router, '/inventory/:id/movements', { POST: recordStockMovement });
defineRoute(router, '/stock-counts', { GET: listStockCounts, POST: createStockCount });
defineRoute(router, '/stock-counts/:id', { GET: getStockCount, PUT: updateStockCount, DELETE: deleteStockCount });
defineRoute(router, '/stock-counts/:id/post', { POST: postStockCount });
defineRoute(router, '/payroll', { GET: listPayroll, POST: paySalaries });
defineRoute(router, '/payroll/rates', { POST: changeSalaryRates });
defineRoute(router, '/payroll/rates/:id', { DELETE: deleteSalaryRate });
defineRoute(router, '/payroll/staff/:id', { GET: getStaffPayroll });
defineRoute(router, '/payroll/:id', { DELETE: undoSalaryPayment });
defineRoute(router, '/me/performance', { GET: getMyPerformance });
defineRoute(router, '/me/salary', { GET: getMySalary });
defineRoute(router, '/waiters', { GET: listWaiters });

export default router;
