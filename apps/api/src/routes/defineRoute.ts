import type { Router } from 'express';
import { METHODS, type RouteHandlers } from '../types/http.js';

// Registers one path's handlers on a router. HEAD falls back to GET (Express
// does this natively), OPTIONS answers 204 with Allow, and any other method on
// a known path is 405 with Allow.
export function defineRoute(router: Router, path: string, handlers: RouteHandlers) {
  const route = router.route(path);
  const allowed: string[] = [];
  for (const method of METHODS) {
    const handler = handlers[method];
    if (!handler) continue;
    allowed.push(method);
    if (method === 'GET') allowed.push('HEAD');
    route[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](handler);
  }
  allowed.push('OPTIONS');
  const allow = allowed.sort().join(', '); // listed alphabetically
  route.options((_req, res) => {
    res.set('Allow', allow).status(204).end();
  });
  route.all((_req, res) => {
    res.set('Allow', allow).status(405).end();
  });
}
