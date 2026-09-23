'use client';

import SettingsForm from '@/components/admin/settings/SettingsForm';
import BusinessSection from '@/components/admin/settings/BusinessSection';
import DeliverySection from '@/components/admin/settings/DeliverySection';
import SocialLinksSection from '@/components/admin/settings/SocialLinksSection';

/** Settings › General: what customers see — receipt details, delivery fee, social links. */
export default function GeneralSettingsPage() {
  return (
    <SettingsForm>
      <BusinessSection />
      <DeliverySection />
      <SocialLinksSection />
    </SettingsForm>
  );
}
