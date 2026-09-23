// "Orders changed" nudges for the admin screens (Server-Sent Events).
//
// Deliberately only a HINT: the event carries no data, it just tells open
// Orders / Tables / badge screens to refetch now instead of on their next
// poll. The screens still poll slowly, so a dropped connection, an API
// restart or a missed event costs a few seconds, never a lost order.
//
// Subscribers live in this process's memory. That is correct for the
// single-container deploy (Lightsail); with several API instances each would
// only nudge its own clients — polling would still catch everything.
import type { Response } from 'express';

const COALESCE_MS = 300;
export const MAX_SUBSCRIBERS = 50;

const subscribers = new Set<Response>();
let pending: NodeJS.Timeout | null = null;

export const subscriberCount = () => subscribers.size;

/** Adds an open SSE response; returns false when the cap is reached. */
export function subscribe(res: Response): boolean {
  if (subscribers.size >= MAX_SUBSCRIBERS) return false;
  subscribers.add(res);
  return true;
}

export function unsubscribe(res: Response) {
  subscribers.delete(res);
}

function broadcast(line: string) {
  for (const res of subscribers) {
    try {
      res.write(line);
    } catch {
      // A socket that died between 'close' events — drop it; its screen polls.
      subscribers.delete(res);
    }
  }
}

/** Something about orders changed. Bursts (a sale writes several things) collapse into one event. */
export function publishOrdersChanged() {
  if (pending || subscribers.size === 0) return;
  pending = setTimeout(() => {
    pending = null;
    broadcast('event: orders\ndata: {}\n\n');
  }, COALESCE_MS);
  pending.unref?.();
}

/** Keeps idle connections open through proxies (a comment line). */
export function heartbeat() {
  broadcast(': ping\n\n');
}

/** Graceful shutdown: end every stream so server.close() isn't held open. */
export function closeAll() {
  for (const res of subscribers) {
    try { res.end(); } catch { /* already gone */ }
  }
  subscribers.clear();
  if (pending) { clearTimeout(pending); pending = null; }
}
