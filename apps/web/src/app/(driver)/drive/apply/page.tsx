import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DriverApplication } from '@/features/driver/components/driver-application';

export const metadata: Metadata = {
  title: 'Drive with CholoJai',
  robots: { index: false, follow: false },
};

export default function DriverApplyPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Drive with CholoJai</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Applications are reviewed by a person. You will keep your rider account
        either way.
      </p>

      <DriverApplication />
    </>
  );
}
