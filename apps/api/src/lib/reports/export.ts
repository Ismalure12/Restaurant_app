// Report exports: a controller describes its report ONCE (title, period,
// filters, summary figures, tables with typed columns) and this writes it as
//   ?format=xlsx → a formatted Excel workbook: a Summary sheet (when there are
//                  figures or several tables) and one sheet per table, each
//                  with the business name + report title, the period and
//                  filters, a styled frozen header with filters, typed cells
//                  ($, counts, %, dates in the business's local time) and a
//                  Total row;
//   ?format=csv  → one table (?table=<key>, default the first) as plain CSV,
//                  for importing into other software.
// Every value is data, never a formula: xlsx cells are written as typed
// values, and the CSV keeps its formula-injection guard (common.ts csvCell).
import ExcelJS from 'exceljs';
import type { Request, Response } from 'express';
import prisma from '../db/prisma.js';
import { env } from '../../config/env.js';
import { searchParams } from '../../utils/query.js';
import { localStamp, toCsv } from './common.js';

export type ColType = 'text' | 'int' | 'qty' | 'money' | 'percent' | 'date' | 'datetime';
/** date = a day key 'YYYY-MM-DD' (or a Date); datetime = an instant (Date), shown in BUSINESS_TZ; percent = 0–100. */
export type Cell = string | number | Date | null | undefined;
export interface Column { header: string; type?: ColType; total?: boolean; width?: number }
export interface Table {
  key: string;
  sheet: string;
  title: string;
  columns: Column[];
  rows: Cell[][];
  note?: string;
  /** false = no Total row even if some columns have total: true. */
  totals?: boolean;
  /** Rows (0-based) to show bold — e.g. subtotals in a statement. */
  boldRows?: number[];
  /** A ready-made Total row (instead of summing the `total: true` columns). */
  totalsRow?: Cell[];
}
export type SummaryRow = [label: string, value: Cell, type?: ColType];
export interface Report {
  title: string;
  /** Base file name, e.g. 'Sales report' → 'Sales report 2026-09-01 to 2026-09-24.xlsx'. */
  file: string;
  period?: { from: string; to: string };
  filters?: [string, string][];
  summary?: SummaryRow[];
  tables: Table[];
}

export const EXPORT_FORMATS = ['xlsx', 'csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The requested export: null = a normal JSON read; 'invalid' = answer 400. */
export function exportFormat(req: Request): ExportFormat | null | 'invalid' {
  const f = searchParams(req).get('format');
  if (!f) return null;
  return (EXPORT_FORMATS as readonly string[]).includes(f) ? (f as ExportFormat) : 'invalid';
}
export const FORMAT_ERROR = 'format must be xlsx or csv';

// ── Formatting ──────────────────────────────────────────────────────────
const MAROON = 'FF850D33';
const MUTED = 'FF57574F';
const BAND = 'FFF7F7F4';
const TOTAL_FILL = 'FFF6E8EC';
const LINE = 'FFD5D5CE';

const NUM_FMT: Record<ColType, string | undefined> = {
  text: undefined,
  int: '#,##0',
  qty: '#,##0.###',
  money: '"$"#,##0.00;[Red]-"$"#,##0.00',
  percent: '0.0%',
  date: 'dd mmm yyyy',
  datetime: 'dd mmm yyyy hh:mm',
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → '1 Sep 2026' (anything else is returned as is). */
export function prettyDay(key: string) {
  const m = DAY_RE.exec(key);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : key;
}

/**
 * Excel dates have no timezone: a Date whose UTC fields are the wall-clock
 * time in BUSINESS_TZ, so the sheet shows the restaurant's local time.
 */
export function excelLocal(d: Date, tz = env.BUSINESS_TZ): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)));
}

const toNumber = (v: Cell) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** The value an xlsx cell gets for a column type. */
function xlsxValue(v: Cell, type: ColType): ExcelJS.CellValue {
  if (v == null || v === '') return null;
  switch (type) {
    case 'int': case 'qty': case 'money': return toNumber(v) ?? String(v);
    case 'percent': { const n = toNumber(v); return n == null ? String(v) : Math.round(n * 100) / 10000; }
    case 'date': {
      if (v instanceof Date) return excelLocal(v);
      const m = DAY_RE.exec(String(v));
      return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : String(v);
    }
    case 'datetime': return v instanceof Date ? excelLocal(v) : String(v);
    default: return v instanceof Date ? localStamp(v, env.BUSINESS_TZ) : String(v);
  }
}

/** The text a CSV cell gets for a column type (numbers stay plain numbers). */
function csvValue(v: Cell, type: ColType): Cell {
  if (v == null) return '';
  if (type === 'money') { const n = toNumber(v); return n == null ? v : n.toFixed(2); }
  if (type === 'date') return v instanceof Date ? localStamp(v, env.BUSINESS_TZ).slice(0, 10) : v;
  if (v instanceof Date) return localStamp(v, env.BUSINESS_TZ);
  return v;
}

/** Shown width of a value, for column sizing. */
function shownLength(v: Cell, type: ColType) {
  if (v == null) return 0;
  if (type === 'money') return (toNumber(v) ?? 0).toFixed(2).length + 4;
  if (type === 'date') return 11;
  if (type === 'datetime') return 17;
  return String(v).length;
}

function totalsOf(t: Table): Cell[] | null {
  if (t.totalsRow && t.totals !== false) return t.rows.length ? t.totalsRow : null;
  if (t.totals === false || !t.columns.some((c) => c.total) || !t.rows.length) return null;
  const row: Cell[] = t.columns.map((c) => (c.total ? t.rows.reduce<number>((s, r) => s + (toNumber(r[t.columns.indexOf(c)]) ?? 0), 0) : null));
  if (!t.columns[0].total) row[0] = 'Total';
  return row.map((v, i) => (typeof v === 'number' && t.columns[i].type === 'money' ? Math.round(v * 100) / 100 : v));
}

// ── Workbook ────────────────────────────────────────────────────────────
function metaLine(report: Report, generatedAt: Date) {
  const parts: string[] = [];
  if (report.period) {
    parts.push(report.period.from === report.period.to
      ? `Day: ${prettyDay(report.period.from)}`
      : `Period: ${prettyDay(report.period.from)} – ${prettyDay(report.period.to)}`);
  }
  if (report.filters?.length) parts.push(`Filters: ${report.filters.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const g = localStamp(generatedAt, env.BUSINESS_TZ);
  parts.push(`Generated ${prettyDay(g.slice(0, 10))} ${g.slice(11)}`);
  return parts.join('   ·   ');
}

function sheetName(name: string, used: Set<string>) {
  let base = name.replace(/[*?:\\/[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let n = 2;
  while (used.has(base.toLowerCase())) base = `${name.slice(0, 28)} ${n++}`;
  used.add(base.toLowerCase());
  return base;
}

function writeHeading(ws: ExcelJS.Worksheet, heading: string, meta: string, span: number) {
  const width = Math.max(span, 4);
  const title = ws.addRow([heading]);
  title.font = { bold: true, size: 14, color: { argb: MAROON } };
  title.height = 22;
  ws.mergeCells(title.number, 1, title.number, width);
  title.commit();
  const m = ws.addRow([meta]);
  m.font = { size: 10, color: { argb: MUTED } };
  ws.mergeCells(m.number, 1, m.number, width);
  m.commit();
  ws.addRow([]).commit();
}

function writeTable(wb: ExcelJS.stream.xlsx.WorkbookWriter, t: Table, heading: string, meta: string, used: Set<string>) {
  const types = t.columns.map((c) => c.type ?? 'text');
  const totals = totalsOf(t);
  const widths = t.columns.map((c, i) => c.width ?? Math.min(48, Math.max(10, c.header.length + 2,
    ...t.rows.slice(0, 2000).map((r) => shownLength(r[i], types[i]) + 2),
    totals ? shownLength(totals[i], types[i]) + 2 : 0)));
  const HEADER_ROW = 4;
  const ws = wb.addWorksheet(sheetName(t.sheet, used), {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: { orientation: t.columns.length > 6 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = widths.map((w, i) => ({ width: w, style: NUM_FMT[types[i]] ? { numFmt: NUM_FMT[types[i]] } : {} }));
  writeHeading(ws, heading, meta, t.columns.length);

  const header = ws.addRow(t.columns.map((c) => c.header));
  header.height = 20;
  header.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MAROON } };
    cell.alignment = { vertical: 'middle', horizontal: types[i - 1] === 'text' || types[i - 1] === 'date' || types[i - 1] === 'datetime' ? 'left' : 'right', wrapText: true };
  });
  header.commit();
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: t.columns.length } };

  if (!t.rows.length) {
    const empty = ws.addRow(['Nothing in this period.']);
    empty.font = { italic: true, color: { argb: MUTED } };
    empty.commit();
  }
  const bold = new Set(t.boldRows ?? []);
  t.rows.forEach((r, idx) => {
    const row = ws.addRow(types.map((type, i) => xlsxValue(r[i], type)));
    types.forEach((type, i) => {
      const cell = row.getCell(i + 1);
      if (NUM_FMT[type]) cell.numFmt = NUM_FMT[type]!;
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      if (bold.has(idx)) cell.font = { bold: true };
    });
    row.commit();
  });
  if (totals) {
    const row = ws.addRow(types.map((type, i) => (i === 0 && totals[0] === 'Total' ? 'Total' : xlsxValue(totals[i], type))));
    types.forEach((type, i) => {
      const cell = row.getCell(i + 1);
      if (NUM_FMT[type] && !(i === 0 && totals[0] === 'Total')) cell.numFmt = NUM_FMT[type]!;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
      cell.border = { top: { style: 'thin', color: { argb: MAROON } } };
    });
    row.commit();
  }
  if (t.note) {
    ws.addRow([]).commit();
    const n = ws.addRow([t.note]);
    n.font = { italic: true, size: 10, color: { argb: MUTED } };
    n.commit();
  }
  ws.commit();
}

function writeSummary(wb: ExcelJS.stream.xlsx.WorkbookWriter, report: Report, heading: string, meta: string, used: Set<string>) {
  const ws = wb.addWorksheet(sheetName('Summary', used), { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 22 }, { width: 44 }];
  writeHeading(ws, heading, meta, 3);
  const section = (label: string) => {
    const r = ws.addRow([label]);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    [1, 2].forEach((i) => { r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MAROON } }; });
    r.commit();
  };
  if (report.summary?.length) {
    section('Key figures');
    report.summary.forEach(([label, value, type = 'text'], idx) => {
      const r = ws.addRow([label, xlsxValue(value, type)]);
      const v = r.getCell(2);
      if (NUM_FMT[type]) v.numFmt = NUM_FMT[type]!;
      v.font = { bold: true };
      v.alignment = { horizontal: 'right' };
      if (idx % 2 === 1) [1, 2].forEach((i) => { r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }; });
      r.getCell(1).border = { bottom: { style: 'hair', color: { argb: LINE } } };
      v.border = { bottom: { style: 'hair', color: { argb: LINE } } };
      r.commit();
    });
    ws.addRow([]).commit();
  }
  if (report.tables.length) {
    section('Sheets in this file');
    report.tables.forEach((t) => {
      const r = ws.addRow([t.sheet, `${t.rows.length} ${t.rows.length === 1 ? 'row' : 'rows'}`, t.title]);
      r.getCell(3).font = { color: { argb: MUTED } };
      r.getCell(2).alignment = { horizontal: 'right' };
      r.commit();
    });
  }
  ws.commit();
}

async function businessName() {
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'business_name' }, select: { value: true } });
    return typeof s?.value === 'string' ? s.value.trim() : '';
  } catch (err) {
    // A title without the business name is still a correct report.
    console.warn('Export: could not read business_name:', (err as Error)?.message);
    return '';
  }
}

function fileName(report: Report, ext: 'xlsx' | 'csv', table?: Table) {
  const period = report.period ? (report.period.from === report.period.to ? ` ${report.period.from}` : ` ${report.period.from} to ${report.period.to}`) : '';
  const base = `${report.file}${table && report.tables.length > 1 ? ` - ${table.sheet}` : ''}${period}`;
  return `${base.replace(/[^a-z0-9 _.-]/gi, '_').replace(/\s+/g, ' ').trim()}.${ext}`;
}

function attachment(res: Response, name: string, type: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
}

/** Write the report in the requested format. Answers 400 for an unknown ?table= on a CSV. */
export async function sendReport(req: Request, res: Response, format: ExportFormat, report: Report) {
  if (format === 'csv') {
    const key = searchParams(req).get('table');
    const t = key ? report.tables.find((x) => x.key === key) : report.tables[0];
    if (!t) return res.status(400).json({ error: `table must be one of: ${report.tables.map((x) => x.key).join(', ')}` });
    const types = t.columns.map((c) => c.type ?? 'text');
    const totals = totalsOf(t);
    const rows = [...t.rows, ...(totals ? [totals] : [])].map((r) => types.map((type, i) => csvValue(r[i], type)));
    attachment(res, fileName(report, 'csv', t), 'text/csv; charset=utf-8');
    return res.send(toCsv(t.columns.map((c) => c.header), rows));
  }

  const name = await businessName();
  const heading = name ? `${name} — ${report.title}` : report.title;
  const meta = metaLine(report, new Date());
  attachment(res, fileName(report, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // Streamed straight into the response: a year of sales never sits in memory as a workbook.
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  wb.creator = name || 'Maqaaxi Pos';
  wb.created = new Date();
  const used = new Set<string>();
  if (report.summary?.length || report.tables.length > 1) writeSummary(wb, report, heading, meta, used);
  for (const t of report.tables) writeTable(wb, t, `${heading} · ${t.title}`, meta, used);
  await wb.commit();
  return res;
}
