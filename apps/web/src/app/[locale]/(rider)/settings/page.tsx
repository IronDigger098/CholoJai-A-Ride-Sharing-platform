import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SettingsScreen } from '@/features/settings/components/settings-screen';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');

  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function SettingsPage(): Promise<ReactNode> {
  const t = await getTranslations('settings');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">{t('intro')}</p>

      <SettingsScreen />
    </>
  );
}
