import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RideHistory } from '@/features/rides/components/ride-history';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rides');

  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function RidesPage(): Promise<ReactNode> {
  const t = await getTranslations('rides');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">{t('intro')}</p>

      <RideHistory />
    </>
  );
}
