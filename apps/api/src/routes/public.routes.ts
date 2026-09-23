// /api — The customer-facing menu, order confirmation, checkout and Sifalo payment flow.
// Fixed paths are listed before their :param siblings.
import { Router } from 'express';
import { defineRoute } from './defineRoute.js';
import { getHealth } from '../controllers/health.controller.js';
import { getMenu } from '../controllers/menu.controller.js';
import { getPublicOrder } from '../controllers/order.controller.js';
import { createCheckout } from '../controllers/checkout.controller.js';
import { initiatePayment, paymentReturn, paymentStatus } from '../controllers/payment.controller.js';
import { getCustomerMe } from '../controllers/customer.controller.js';

const router = Router();

defineRoute(router, '/health', { GET: getHealth });
defineRoute(router, '/menu', { GET: getMenu });
defineRoute(router, '/order', { GET: getPublicOrder });
defineRoute(router, '/checkout', { POST: createCheckout });
defineRoute(router, '/payment/initiate', { POST: initiatePayment });
defineRoute(router, '/payment/return', { GET: paymentReturn });
defineRoute(router, '/payment/status', { POST: paymentStatus });
defineRoute(router, '/customer/me', { GET: getCustomerMe });

export default router;
