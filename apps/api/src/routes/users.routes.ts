// /api — Staff user accounts.
// Fixed paths are listed before their :param siblings.
import { Router } from 'express';
import { defineRoute } from './defineRoute.js';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/users.controller.js';

const router = Router();

defineRoute(router, '/users', { GET: listUsers, POST: createUser });
defineRoute(router, '/users/:id', { PUT: updateUser, DELETE: deleteUser });

export default router;
