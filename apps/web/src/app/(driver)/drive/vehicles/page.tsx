import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { VehicleManager } from '@/features/driver/components/vehicle-manager';

export const metadata: Metadata = {
  title: 'Your vehicles',
  robots: { index: false, follow: false },
};

export default function DriverVehiclesPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Your vehicles</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Rides are dispatched in your active vehicle. You can register several
        and switch between them.
      </p>

      <VehicleManager />
    </>
  );
}
