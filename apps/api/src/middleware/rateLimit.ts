// Per-IP request limits for the public payment endpoints (abuse protection:
// fake checkouts filling payment_sessions, hammering Sifalo through us).
//
// Fixed window, counted in this process's memory. That is the right tool for
// the single-container deploy (Lightsail); counts reset on restart and are not
// shared between instances — move to a shared store if the API is ever scaled
// out. Limits are generous because a whole restaurant's Wi-Fi shares one
// public IP.
import type { Request, Response, NextFunction } from 'express';

type Window = { count: number; resetAt: number };

export function rateLimit({ name, max, windowMs }: { name: string; max: number; windowMs: number }) {
  const hits = new Map<string, Window>();

  // Forget finished windows so the map never grows with every visitor.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, w] of hits) if (w.resetAt <= now) hits.delete(key);
  }, Math.max(windowMs, 60_000));
  sweep.unref();

  return function limit(req: Request, res: Response, next: NextFunction) {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let w = hits.get(key);
    if (!w || w.resetAt <= now) {
      w = { count: 0, resetAt: now + windowMs };
      hits.set(key, w);
    }
    w.count += 1;
    if (w.count > max) {
      const retryAfter = Math.ceil((w.resetAt - now) / 1000);
      console.warn(`rate limit: ${name} exceeded by ${key} (${w.count}/${max})`);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts — please wait a few minutes and try again' });
    }
    next();
  };
}
