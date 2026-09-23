'use client';

import SettingsForm from '@/components/admin/settings/SettingsForm';
import AccountsTaxSection from '@/components/admin/settings/AccountsTaxSection';
import CalendarSection from '@/components/admin/settings/CalendarSection';

/** Settings › Money: business accounts, tax, business calendar and opening balances. */
export default function MoneySettingsPage() {
  return (
    <SettingsForm>
      <AccountsTaxSection />
      <CalendarSection />
    </SettingsForm>
  );
}
