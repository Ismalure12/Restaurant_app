// /api — Staff sign-in, session and password reset.
// Fixed paths are listed before their :param siblings.
import { Router } from 'express';
import { defineRoute } from './defineRoute.js';
import { login, logout, getMe, forgotPassword, resetPassword, setCookie } from '../controllers/auth.controller.js';

const router = Router();

defineRoute(router, '/auth/login', { POST: login, DELETE: logout });
defineRoute(router, '/auth/me', { GET: getMe });
defineRoute(router, '/auth/forgot-password', { POST: forgotPassword });
defineRoute(router, '/auth/reset-password', { POST: resetPassword });
defineRoute(router, '/auth/set-cookie', { POST: setCookie });

export default router;
