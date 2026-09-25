import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RideDetail } from '@/features/rides/components/ride-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rides');

  return { title: t('rideTitle'), robots: { index: false, follow: false } };
}

/** Params are a promise in Next 15+; the page awaits them. */
export default async function RidePage({
  params,
}: {
  params: Promise<{ rideId: string }>;
}): Promise<ReactNode> {
  const { rideId } = await params;

  return <RideDetail rideId={rideId} />;
}
