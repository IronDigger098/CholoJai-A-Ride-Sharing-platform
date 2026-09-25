import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { BookingForm } from '@/features/booking/components/booking-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('booking');

  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function BookPage(): Promise<ReactNode> {
  const t = await getTranslations('booking');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">{t('intro')}</p>

      <BookingForm />
    </>
  );
}
