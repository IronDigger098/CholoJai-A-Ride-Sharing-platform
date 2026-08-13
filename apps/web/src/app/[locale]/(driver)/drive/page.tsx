import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { DriverDashboard } from '@/features/driver/components/driver-dashboard';

export const metadata: Metadata = {
  title: 'Driving',
  robots: { index: false, follow: false },
};

export default function DrivePage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Driving</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        <Link href="/drive/vehicles">Vehicles</Link> ·{' '}
        <Link href="/drive/apply">Application</Link>
      </p>

      <DriverDashboard />
    </>
  );
}
