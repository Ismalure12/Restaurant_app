import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { createPrismaMock, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { sendReport, excelLocal, prettyDay, exportFormat } = await import('../src/lib/reports/export.js');
type Report = Parameters<typeof sendReport>[3];

/** A stand-in for Express's res: a writable stream that records headers, status and body. */
function fakeRes() {
  const s = new PassThrough();
  const chunks: Buffer[] = [];
  s.on('data', (c: Buffer) => chunks.push(c));
  const res = Object.assign(s, {
    headers: {} as Record<string, string>,
    statusCode: 200,
    jsonBody: undefined as unknown,
    setHeader(k: string, v: string) { res.headers[k.toLowerCase()] = v; },
    status(c: number) { res.statusCode = c; return res; },
    json(b: unknown) { res.jsonBody = b; return res; },
    send(b: string) { chunks.push(Buffer.from(b)); return res; },
    body: () => Buffer.concat(chunks),
  });
  return res;
}
const req = (qs: string) => ({ url: `/x?${qs}`, originalUrl: `/x?${qs}`, query: Object.fromEntries(new URLSearchParams(qs)) });

const REPORT: Report = {
  title: 'Sales report',
  file: 'Sales report',
  period: { from: '2026-09-01', to: '2026-09-24' },
  filters: [['Served by', 'Salman'], ['Channel', 'Online']],
  summary: [['Orders', 12, 'int'], ['Net sales', 345.5, 'money']],
  tables: [
    {
      key: 'days', sheet: 'By day', title: 'Sales by day',
      columns: [{ header: 'Date', type: 'date' }, { header: 'Orders', type: 'int', total: true }, { header: 'Sales', type: 'money', total: true }],
      rows: [['2026-09-01', 5, 100.25], ['2026-09-02', 7, 245.25]],
    },
    {
      key: 'dishes', sheet: 'Dishes', title: 'Every dish sold',
      columns: [{ header: 'Dish' }, { header: 'Share', type: 'percent' }, { header: 'Closed', type: 'datetime' }],
      rows: [['=cmd|calc', 12.5, new Date('2026-09-01T09:30:00Z')]],
    },
  ],
};

async function workbookOf(r: ReturnType<typeof fakeRes>) {
  await new Promise((done) => (r.writableEnded ? done(null) : r.on('finish', done)));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.body() as never);
  return wb;
}

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  db.setting.findUnique.mockResolvedValue({ value: 'KFG Galkacyo' });
});

describe('report export', () => {
  it('xlsx: Summary + one sheet per table, titled, typed, totalled', async () => {
    const res = fakeRes();
    await sendReport(req('format=xlsx') as never, res as never, 'xlsx', REPORT);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="Sales report 2026-09-01 to 2026-09-24.xlsx"');
    const wb = await workbookOf(res);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'By day', 'Dishes']);

    const sum = wb.getWorksheet('Summary')!;
    expect(sum.getCell('A1').value).toBe('KFG Galkacyo — Sales report');
    expect(String(sum.getCell('A2').value)).toMatch(/Period: 1 Sep 2026 – 24 Sep 2026 .*Filters: Served by Salman, Channel Online/);
    expect(sum.getCell('B6').value).toBe(345.5);
    expect(sum.getCell('B6').numFmt).toContain('$');

    const days = wb.getWorksheet('By day')!;
    expect(days.getCell('A4').value).toBe('Date');
    expect(days.getCell('A4').font?.bold).toBe(true);
    expect(days.getCell('A5').value).toEqual(new Date(Date.UTC(2026, 8, 1)));
    expect(days.getCell('C5').value).toBe(100.25);
    expect(days.getCell('C5').numFmt).toContain('$');
    expect(days.getCell('A7').value).toBe('Total');
    expect(days.getCell('B7').value).toBe(12);
    expect(days.getCell('C7').value).toBe(345.5);

    const dishes = wb.getWorksheet('Dishes')!;
    expect(dishes.getCell('A5').value).toBe('=cmd|calc'); // a string, never a formula
    expect(dishes.getCell('A5').type).toBe(ExcelJS.ValueType.String);
    expect(dishes.getCell('B5').value).toBe(0.125);
    expect(dishes.getCell('B5').numFmt).toBe('0.0%');
    // 09:30 UTC is 12:30 in Mogadishu (UTC+3), shown as local wall time.
    expect(dishes.getCell('C5').value).toEqual(new Date(Date.UTC(2026, 8, 1, 12, 30)));
  });

  it('csv: the chosen table, typed values, total row; unknown table → 400', async () => {
    const res = fakeRes();
    await sendReport(req('format=csv&table=days') as never, res as never, 'csv', REPORT);
    expect(res.headers['content-disposition']).toBe('attachment; filename="Sales report - By day 2026-09-01 to 2026-09-24.csv"');
    const text = res.body().toString('utf8');
    expect(text).toContain('"Date","Orders","Sales"');
    expect(text).toContain('"2026-09-01","5","100.25"');
    expect(text).toContain('"Total","12","345.50"');

    const bad = fakeRes();
    await sendReport(req('format=csv&table=nope') as never, bad as never, 'csv', REPORT);
    expect(bad.statusCode).toBe(400);
  });

  it('helpers', () => {
    expect(prettyDay('2026-09-05')).toBe('5 Sep 2026');
    expect(excelLocal(new Date('2026-01-01T22:15:00Z'), 'Africa/Mogadishu')).toEqual(new Date(Date.UTC(2026, 0, 2, 1, 15)));
    expect(exportFormat(req('format=xlsx') as never)).toBe('xlsx');
    expect(exportFormat(req('') as never)).toBeNull();
    expect(exportFormat(req('format=pdf') as never)).toBe('invalid');
  });
});
