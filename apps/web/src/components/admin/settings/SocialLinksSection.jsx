'use client';

import { Button, Icon, IconButton, MenuItem, Popover, inputCls } from '@/components/admin/ui';
import { SettingsCard } from './shared';

const PLATFORMS = [
  { value: 'phone', label: 'Phone', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>) },
  { value: 'whatsapp', label: 'WhatsApp', icon: (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>) },
  { value: 'instagram', label: 'Instagram', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>) },
  { value: 'facebook', label: 'Facebook', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>) },
  { value: 'twitter', label: 'X / Twitter', icon: (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>) },
  { value: 'tiktok', label: 'TikTok', icon: (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.88a8.28 8.28 0 0 0 4.76 1.5V6.93a4.84 4.84 0 0 1-1-.24z" /></svg>) },
  { value: 'website', label: 'Website', icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>) },
];
export const platformInfo = (p) => PLATFORMS.find((x) => x.value === p) || { value: p, label: p, icon: null };
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
 */
export default function SocialLinksSection({ rows, onChange, loaded, disabled }) {
  const used = new Set(rows.map((r) => r.platform));
  const available = PLATFORMS.filter((p) => !used.has(p.value));
  const setValue = (platform, value) => onChange(rows.map((r) => (r.platform === platform ? { ...r, value } : r)));
  const remove = (platform) => onChange(rows.filter((r) => r.platform !== platform));
  const add = (platform) => {
    onChange([...rows, { platform, value: '' }]);
    // Focus the new row's input once it renders.
    setTimeout(() => document.getElementById(`social-${platform}`)?.focus(), 0);
  };

  const addButton = available.length > 0 && (
    <Popover
      align="right"
      width={200}
      trigger={({ open, toggle }) => (
        <Button size="xs" icon="plus" onClick={toggle} disabled={disabled || !loaded} aria-haspopup="menu" aria-expanded={open}>Add link</Button>
      )}
    >
      {({ close }) => (
        <div role="menu">
          {available.map((p) => (
            <MenuItem key={p.value} onClick={() => { close(); add(p.value); }}>
              <span className="inline-flex items-center gap-2.5"><span className="w-4 h-4 text-mq-muted [&>svg]:w-4 [&>svg]:h-4">{p.icon}</span>{p.label}</span>
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );

  return (
    <SettingsCard title="Social links" sub="Shown in the customer menu footer and contact screen." actions={addButton}>
      {!loaded ? <p className="m-0 text-[13px] text-mq-muted">Loading…</p> : rows.length === 0 ? (
        <p className="m-0 text-[13px] text-mq-muted">No links yet. Use Add link for your phone, WhatsApp or pages.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const info = platformInfo(r.platform);
            const blank = !r.value.trim();
            return (
              <div key={r.platform} className="grid items-start gap-2 grid-cols-[minmax(92px,120px)_minmax(0,1fr)_40px]">
                <label htmlFor={`social-${r.platform}`} className="flex items-center gap-2 min-h-[42px] text-[13.5px] font-semibold text-mq-ink min-w-0">
                  <span className="w-4 h-4 flex-none text-mq-muted [&>svg]:w-4 [&>svg]:h-4">{info.icon}</span>
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
                <IconButton icon="trash" size={42} label={`Remove ${info.label}`} onClick={() => remove(r.platform)} disabled={disabled} />
              </div>
            );
          })}
        </div>
      )}
      {loaded && available.length === 0 && <p className="m-0 mt-3 text-xs text-mq-muted inline-flex items-center gap-1.5"><Icon name="check" size={13} />Every platform has a link.</p>}
    </SettingsCard>
  );
}
