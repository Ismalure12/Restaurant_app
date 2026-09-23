'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useAccess from '@/hooks/useAccess';
import { Icon, Tabs, cx } from '@/components/admin/ui';

const D = '/admin/dashboard/settings';
const MANAGER = ['admin', 'manager'];
// General + Money follow the `settings` permission; Staff access + Audit log
// are fixed to the admin and managers (lib/adminAccess.js says the same).
const SECTIONS = [
  { value: 'general', label: 'Business & receipt', icon: 'invoice', gate: 'settings' },
  { value: 'money', label: 'Accounts, tax & calendar', icon: 'cash', gate: 'settings' },
  { value: 'access', label: 'Staff access', icon: 'lock', gate: 'manager' },
  { value: 'audit', label: 'Audit log', icon: 'clock', gate: 'manager' },
];

/**
 * Settings is one page with a section menu: a left card on wide screens, a
 * tab row below 900px. Each section keeps its own URL (/settings/<section>).
 */
export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  const { role, canView } = useAccess();
  const sections = SECTIONS.filter((s) => (s.gate === 'manager' ? MANAGER.includes(role) : canView('settings')));
  const current = sections.find((s) => pathname === `${D}/${s.value}` || pathname.startsWith(`${D}/${s.value}/`))?.value;

  return (
    <div className="w-full max-w-[1200px] px-3 pt-4 pb-12 tab:px-4 desk:px-5 flex flex-col gap-4">
      {sections.length > 1 && (
        <Tabs className="nar:hidden" value={current} tabs={sections.map((s) => ({ value: s.value, label: s.label, href: `${D}/${s.value}` }))} />
      )}
      <div className="flex gap-4 items-start">
        {sections.length > 0 && (
          <nav aria-label="Settings sections" className="hidden nar:flex flex-col gap-0.5 w-[236px] flex-none sticky top-[76px] bg-white border border-mq-line rounded-xl shadow-mq-card p-2">
            {sections.map((s) => {
              const on = s.value === current;
              return (
                <Link
                  key={s.value}
                  href={`${D}/${s.value}`}
                  aria-current={on ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-2.5 min-h-9 px-2.5 py-2 rounded-lg text-[13.5px] transition-colors',
                    on ? 'bg-mq-soft text-mq-primary font-semibold' : 'text-mq-body hover:bg-mq-canvas hover:text-mq-ink',
                  )}
                >
                  <Icon name={s.icon} size={17} />
                  {s.label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-3.5">{children}</div>
      </div>
    </div>
  );
}
