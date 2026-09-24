import type { Db } from '../db/prisma.js';

// The manager's switch for online ordering (Settings › General). Off = the
// public menu still shows, but checkout and payment/initiate refuse with the
// manager's message. A missing row means on.
export const ONLINE_ORDERING_KEY = 'online_ordering';
export const ONLINE_ORDERING_MESSAGE_KEY = 'online_ordering_message';
export const DEFAULT_OFF_MESSAGE = 'Online ordering is coming soon. Please order with a waiter.';

export function onlineOrderingFrom(map: Record<string, string | undefined>) {
  return {
    enabled: map[ONLINE_ORDERING_KEY] !== 'off',
    message: map[ONLINE_ORDERING_MESSAGE_KEY]?.trim() || DEFAULT_OFF_MESSAGE,
  };
}

export async function readOnlineOrdering(db: Pick<Db, 'setting'>) {
  const rows = await db.setting.findMany({ where: { key: { in: [ONLINE_ORDERING_KEY, ONLINE_ORDERING_MESSAGE_KEY] } } });
  return onlineOrderingFrom(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

/** The 409 body checkout/initiate send while online ordering is off. */
export const orderingOffBody = (message: string) => ({ error: message, code: 'ONLINE_ORDERING_OFF' });
