'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useAccess from '@/hooks/useAccess';
import { cx } from '@/components/admin/ui';

const D = '/admin/dashboard/settings';
const MANAGER = ['admin', 'manager'];

// The section icons exactly as the design draws them (17px, stroke 1.8).
const ICON = {
  general: <path d="M3 7h18M3 12h18M3 17h10" />,
  money: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  access: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  audit: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

// General + Money follow the `settings` permission; Staff access + Audit log
// are fixed to the admin and managers (lib/adminAccess.js says the same).
const SECTIONS = [
  { value: 'general', label: 'Business & receipt', gate: 'settings' },
  { value: 'money', label: 'Accounts, tax & calendar', gate: 'settings' },
  { value: 'access', label: 'Staff access', gate: 'manager' },
  { value: 'audit', label: 'Audit log', gate: 'manager' },
];

/**
 * Settings is one page: a section menu card on the left (stacked above the
 * section on a phone), the section's cards on the right. Each section keeps
 * its own URL (/settings/<section>).
 */
export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  const { role, canView } = useAccess();
  const sections = SECTIONS.filter((s) => (s.gate === 'manager' ? MANAGER.includes(role) : canView('settings')));
  const current = sections.find((s) => pathname === `${D}/${s.value}` || pathname.startsWith(`${D}/${s.value}/`))?.value;

  return (
    <div className="w-full max-w-[1200px] px-3 tab:px-4 desk:px-5 pt-[18px] pb-12">
      <div className="flex flex-col tab:flex-row gap-4 items-stretch tab:items-start">
        {sections.length > 0 && (
          <nav
            aria-label="Settings sections"
            className="flex flex-col gap-0.5 p-2 bg-white border border-mq-line rounded-xl shadow-mq-card tab:w-[236px] tab:flex-none tab:sticky tab:top-[76px]"
          >
            {sections.map((s) => {
              const on = s.value === current;
              return (
                <Link
                  key={s.value}
                  href={`${D}/${s.value}`}
                  aria-current={on ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-2.5 min-h-11 p-2.5 rounded-lg text-[13.5px] transition-colors',
                    on ? 'bg-mq-soft text-mq-primary font-semibold' : 'text-mq-body font-medium hover:bg-mq-canvas hover:text-mq-ink',
                  )}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="block flex-none" aria-hidden="true">{ICON[s.value]}</svg>
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
