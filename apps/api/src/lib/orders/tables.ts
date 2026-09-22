// The restaurant's tables (DiningTable). Once any table is defined the Register
// must pick from the list, and "5", "T5" and "Table 5" all mean the same table:
// the order stores the table's canonical name. With no tables defined the
// Register keeps taking free text, so nothing changes until a manager adds some.
import type { Db } from '../db/prisma.js';

type Reader = Pick<Db, 'diningTable'>;

/** "Table 5", "T5", "t 5" and "5" all normalise to "5" ("Terrace 2" is left alone: a lone T only counts before a number). */
export const tableKey = (s: string) => s.trim().toLowerCase().replace(/^(?:(?:table|tbl)[\s.#-]*|t(?=[\s.#-]*\d)[\s.#-]*)/, '').replace(/\s+/g, '');

export async function resolveTable(db: Reader, raw: string | null | undefined): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const tables = await db.diningTable.findMany({ where: { isActive: true }, select: { name: true }, take: 500 });
  const text = (raw ?? '').trim();
  if (!tables.length) return { ok: true, value: text || null };
  if (!text) return { ok: false, error: 'Choose the table' };
  const key = tableKey(text);
  const match = tables.find((t) => tableKey(t.name) === key);
  if (!match) return { ok: false, error: `"${text}" is not one of the restaurant's tables` };
  return { ok: true, value: match.name };
}
