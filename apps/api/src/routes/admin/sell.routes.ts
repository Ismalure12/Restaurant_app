// /api/admin — Sell: live Orders (+ actions), the Register, online payments, tables, Sales history and the live-update stream.
// Fixed paths are listed before their :param siblings.
import { Router } from 'express';
import { defineRoute } from '../defineRoute.js';
import { listOrders, getOrderCounts, getOrder, updateOrder } from '../../controllers/admin/orders.controller.js';
import { acceptOrder, declineOrder, voidOrder, addOrderItems, payOrder } from '../../controllers/admin/orderActions.controller.js';
import { createPosOrder } from '../../controllers/admin/pos.controller.js';
import { listOnlinePayments, recheckOnlinePayment, dismissOnlinePayment } from '../../controllers/admin/onlinePayments.controller.js';
import { streamEvents } from '../../controllers/admin/events.controller.js';
import { listTables, createTable, updateTable, deleteTable } from '../../controllers/admin/tables.controller.js';
import { listSaleCashiers, listSales, listSoldItems } from '../../controllers/admin/sales.controller.js';

const router = Router();

defineRoute(router, '/orders', { GET: listOrders });
defineRoute(router, '/orders/counts', { GET: getOrderCounts });
defineRoute(router, '/orders/:id', { GET: getOrder, PATCH: updateOrder });
defineRoute(router, '/orders/:id/accept', { POST: acceptOrder });
defineRoute(router, '/orders/:id/decline', { POST: declineOrder });
defineRoute(router, '/orders/:id/void', { POST: voidOrder });
defineRoute(router, '/orders/:id/items', { POST: addOrderItems });
defineRoute(router, '/orders/:id/pay', { POST: payOrder });
defineRoute(router, '/pos/orders', { POST: createPosOrder });
defineRoute(router, '/online-payments', { GET: listOnlinePayments });
defineRoute(router, '/online-payments/:id/recheck', { POST: recheckOnlinePayment });
defineRoute(router, '/online-payments/:id/dismiss', { POST: dismissOnlinePayment });
defineRoute(router, '/events', { GET: streamEvents });
defineRoute(router, '/tables', { GET: listTables, POST: createTable });
defineRoute(router, '/tables/:id', { PUT: updateTable, DELETE: deleteTable });
defineRoute(router, '/sales', { GET: listSales });
defineRoute(router, '/sales/items', { GET: listSoldItems });
defineRoute(router, '/sales/cashiers', { GET: listSaleCashiers });

export default router;
