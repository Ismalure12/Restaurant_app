'use client';

import { useState } from 'react';
import Field from '@/components/admin/Field';
import { Button, Modal, ModalSpacer, inputCls, selectCls } from '@/components/admin/ui';
import { SettingsCard } from './shared';

const PLATFORMS = [
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'twitter', label: 'X / Twitter' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'website', label: 'Website' },
];
export const platformInfo = (p) => PLATFORMS.find((x) => x.value === p) || { value: p, label: p };
const placeholderFor = (p) => (p === 'phone' || p === 'whatsapp') ? '+252 70 000 0000' : 'https://example.com';

/** Draft rows ({platform, value}) from the saved links. */
export const rowsFromLinks = (links) => links.map((l) => ({ platform: l.platform, value: l.value }));

/**
 * What Save must send to turn the saved links into the draft rows, keyed by
 * platform (one link per platform): POST new ones, PUT changed values, DELETE
 * removed ones. Re-running it after a partial failure (and a refetch) yields
 * only what is still left to do. Blank new rows are not sent — they block Save.
 */
export function linkOps(links, rows) {
  const saved = new Map(links.map((l) => [l.platform, l]));
  const ops = [];
  for (const r of rows) {
    const v = r.value.trim();
    const s = saved.get(r.platform);
    if (!s) { if (v) ops.push({ method: 'POST', url: '/api/social-links', body: { platform: r.platform, value: v } }); }
    else if (v && v !== s.value) ops.push({ method: 'PUT', url: `/api/social-links/${s.id}`, body: { value: v } });
  }
  const kept = new Set(rows.map((r) => r.platform));
  for (const l of links) if (!kept.has(l.platform)) ops.push({ method: 'DELETE', url: `/api/social-links/${l.id}` });
  return ops;
}
/** Rows that can't be saved yet: no handle / link typed. */
export const blankRows = (rows) => rows.filter((r) => !r.value.trim());

/**
 * Settings › General: links shown in the public menu footer and contact
 * screen. Controlled — edits are a draft sent by the section's one Save.
 * "Add link" asks for the platform and handle in a dialog, then adds the row.
 */
export default function SocialLinksSection({ rows, onChange, loaded, disabled }) {
  const used = new Set(rows.map((r) => r.platform));
  const available = PLATFORMS.filter((p) => !used.has(p.value));
  const setValue = (platform, value) => onChange(rows.map((r) => (r.platform === platform ? { ...r, value } : r)));
  const remove = (platform) => onChange(rows.filter((r) => r.platform !== platform));

  const [adding, setAdding] = useState(null); // { platform, value } while the dialog is open
  const openAdd = () => setAdding({ platform: available[0]?.value || '', value: '' });
  const submitAdd = (e) => {
    e?.preventDefault();
    if (!adding?.platform || !adding.value.trim()) return;
    onChange([...rows, { platform: adding.platform, value: adding.value.trim() }]);
    setAdding(null);
  };

  const addButton = available.length > 0 && (
    <Button size="xs" onClick={openAdd} disabled={disabled || !loaded}>Add link</Button>
  );

  return (
    <SettingsCard title="Social links" sub="Shown in the public menu footer" actions={addButton}>
      {!loaded ? <p className="m-0 text-[13px] text-mq-on-tint">Loading…</p> : rows.length === 0 ? (
        <p className="m-0 text-[13px] text-mq-on-tint">No links yet. The public menu footer shows none.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const info = platformInfo(r.platform);
            const blank = !r.value.trim();
            return (
              <div key={r.platform} className="grid items-start gap-2 grid-cols-[92px_minmax(0,1fr)_40px] tab:grid-cols-[110px_minmax(0,1fr)_40px]">
                <label htmlFor={`social-${r.platform}`} className="flex items-center min-h-[42px] text-[13.5px] font-semibold text-mq-ink min-w-0">
                  <span className="truncate">{info.label}</span>
                </label>
                <div className="flex flex-col gap-1 min-w-0">
                  <input
                    id={`social-${r.platform}`}
                    className={inputCls({ size: 'lg' })}
                    value={r.value}
                    disabled={disabled}
                    onChange={(e) => setValue(r.platform, e.target.value)}
                    placeholder={placeholderFor(r.platform)}
                    aria-describedby={blank ? `social-${r.platform}-msg` : undefined}
                  />
                  {blank && <span id={`social-${r.platform}-msg`} className="text-xs text-mq-muted">Enter the handle or link, or remove this row</span>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.platform)}
                  disabled={disabled}
                  aria-label={`Remove ${info.label}`}
                  title="Remove"
                  className="mt-px grid place-items-center w-10 h-10 rounded-lg border border-mq-line bg-white text-mq-muted transition-colors hover:bg-mq-danger-bg hover:text-mq-danger-ink focus-visible:outline-none focus-visible:shadow-mq-focus disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <Modal
          eyebrow="Social link"
          title="Add a link"
          width={460}
          onClose={() => setAdding(null)}
          footer={<><ModalSpacer /><Button onClick={() => setAdding(null)}>Cancel</Button><Button variant="primary" onClick={submitAdd} disabled={!adding.value.trim()}>Add link</Button></>}
        >
          <form className="flex flex-col gap-3.5" onSubmit={submitAdd} noValidate>
            <Field label="Platform" required>
              <select className={selectCls({ size: 'lg' })} value={adding.platform} onChange={(e) => setAdding({ ...adding, platform: e.target.value })}>
                {available.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Handle / URL" required hint="Saved with the section’s Save changes.">
              <input className={inputCls({ size: 'lg' })} value={adding.value} maxLength={300} onChange={(e) => setAdding({ ...adding, value: e.target.value })} placeholder={placeholderFor(adding.platform)} />
            </Field>
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        </Modal>
      )}
    </SettingsCard>
  );
}
