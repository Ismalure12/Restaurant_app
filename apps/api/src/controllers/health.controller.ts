import type { Request, Response } from 'express';

// GET /api/health — liveness probe for the container healthcheck, the deploy
// script and nginx. Public and deliberately trivial: no auth, no database, no
// version or environment details. A healthcheck runs every few seconds, so it
// must not touch Postgres, and it must not tell an anonymous caller anything
// beyond "this process is answering".
export function getHealth(_req: Request, res: Response) {
  res.status(200).json({ ok: true, uptime: Math.round(process.uptime()) });
}
