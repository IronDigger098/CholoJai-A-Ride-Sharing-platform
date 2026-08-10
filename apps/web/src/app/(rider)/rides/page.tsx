import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RideHistory } from '@/features/rides/components/ride-history';

export const metadata: Metadata = {
  title: 'Your rides',
  robots: { index: false, follow: false },
};

export default function RidesPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Your rides</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Every trip you have booked, newest first.
      </p>

      <RideHistory />
    </>
  );
}
