import { describe, it, expect } from 'vitest';
import { dayKey, startOfDay, rangeFromQuery, addDays, isDayKey, setBusinessDayEnd } from '../src/lib/time/businessTime.js';
import { formatOrderCode, parseOrderCode } from '../src/lib/orders/orderCode.js';
import { formatReceiptNo } from '../src/lib/orders/receiptNo.js';

// Mogadishu is UTC+3 all year: local midnight = 21:00 UTC the day before.
describe('business days (Africa/Mogadishu)', () => {
  it('a sale at 21:30 UTC belongs to the NEXT local day', () => {
    expect(dayKey(new Date('2026-09-18T20:59:59Z'))).toBe('2026-09-18');
    expect(dayKey(new Date('2026-09-18T21:00:00Z'))).toBe('2026-09-19');
    expect(dayKey(new Date('2026-09-18T21:30:00Z'))).toBe('2026-09-19');
  });

  it('local midnight → UTC instant', () => {
    expect(startOfDay('2026-09-19').toISOString()).toBe('2026-09-18T21:00:00.000Z');
    expect(startOfDay('2026-01-01').toISOString()).toBe('2025-12-31T21:00:00.000Z');
  });

  it('date helpers', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-9-1')).toBe(false);
  });
});

describe('rangeFromQuery', () => {
  const now = new Date('2026-09-19T08:00:00Z');

  it('from/to inclusive local days → [from, to) UTC bounds', () => {
    const { range } = rangeFromQuery('2026-09-01', '2026-09-19', { now });
    expect(range!.from.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(range!.to.toISOString()).toBe('2026-09-19T21:00:00.000Z');
    expect(range!.days).toBe(19);
  });

  it('defaults to the last N days ending today', () => {
    const { range } = rangeFromQuery(null, null, { now, defaultDays: 30 });
    expect(range!.fromKey).toBe('2026-08-21');
    expect(range!.toKey).toBe('2026-09-19');
  });

  it('rejects bad dates, reversed ranges and > 366 days', () => {
    expect(rangeFromQuery('2026-13-01', null, { now }).error).toBeTruthy();
    expect(rangeFromQuery('2026-09-10', '2026-09-01', { now }).error).toBeTruthy();
    expect(rangeFromQuery('2025-01-01', '2026-09-19', { now }).error).toMatch(/366/);
    expect(rangeFromQuery('2025-09-19', '2026-09-19', { now }).error).toBeUndefined();
  });
});

describe('order codes + receipt numbers', () => {
  it('KFG-YYMMDD-NNNN from id + LOCAL creation date', () => {
    expect(formatOrderCode({ id: 101, createdAt: new Date('2026-09-18T22:00:00Z') })).toBe('KFG-260919-0101');
    expect(formatOrderCode({ id: 12345, createdAt: '2026-09-19T08:00:00Z' }, 'GAL')).toBe('GAL-260919-12345');
  });

  it('parses a code, a partial code or a bare number back to the id', () => {
    expect(parseOrderCode('KFG-260919-0101')).toBe(101);
    expect(parseOrderCode('kfg-260919-0101')).toBe(101);
    expect(parseOrderCode('260919-0101')).toBe(101);
    expect(parseOrderCode('#101')).toBe(101);
    expect(parseOrderCode('0101')).toBe(101);
    expect(parseOrderCode('burger')).toBeNull();
    expect(parseOrderCode('0')).toBeNull();
  });

  it('receipt # is zero-padded to 4', () => {
    expect(formatReceiptNo(1)).toBe('0001');
    expect(formatReceiptNo(12345)).toBe('12345');
    expect(formatReceiptNo(null)).toBeNull();
  });
});

describe('business day end hour', () => {
  it('a 04:00 cutoff keeps a 01:30 sale on the previous day', () => {
    setBusinessDayEnd(4);
    try {
      // 01:30 local on the 12th = 22:30 UTC on the 11th
      expect(dayKey(new Date('2026-09-11T22:30:00Z'))).toBe('2026-09-11');
      // 04:00 local on the 12th = 01:00 UTC → the new day starts
      expect(dayKey(new Date('2026-09-12T00:59:59Z'))).toBe('2026-09-11');
      expect(dayKey(new Date('2026-09-12T01:00:00Z'))).toBe('2026-09-12');
      expect(startOfDay('2026-09-12').toISOString()).toBe('2026-09-12T01:00:00.000Z');
      const r = rangeFromQuery('2026-09-12', '2026-09-12', { now: new Date('2026-09-12T06:00:00Z') });
      expect(r.range?.from.toISOString()).toBe('2026-09-12T01:00:00.000Z');
      expect(r.range?.to.toISOString()).toBe('2026-09-13T01:00:00.000Z');
    } finally { setBusinessDayEnd(0); }
    expect(dayKey(new Date('2026-09-11T22:30:00Z'))).toBe('2026-09-12');
  });
});
