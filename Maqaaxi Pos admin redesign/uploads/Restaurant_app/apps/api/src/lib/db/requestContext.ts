// Per-request flags shared between layers that don't know about each other.
// `dbDown` is set by dbRetry when the database could not be reached even after
// retrying; the response layer (app.ts) then answers 503 DB_UNAVAILABLE
// instead of a bare 500, so the app can say "can't reach the server" rather
// than "internal error".
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext { dbDown: boolean }
export const requestContext = new AsyncLocalStorage<RequestContext>();

export const markDbDown = () => { const ctx = requestContext.getStore(); if (ctx) ctx.dbDown = true; };
export const isDbDown = () => requestContext.getStore()?.dbDown === true;
