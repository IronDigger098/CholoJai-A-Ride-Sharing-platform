import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SettingsScreen } from '@/features/settings/components/settings-screen';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default function SettingsPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Your profile, how the app looks, what it tells you about, and your
        password.
      </p>

      <SettingsScreen />
    </>
  );
}
