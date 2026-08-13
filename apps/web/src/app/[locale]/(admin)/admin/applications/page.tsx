import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ApplicationQueue } from '@/features/admin/components/application-queue';

export const metadata: Metadata = {
  title: 'Driver applications',
  robots: { index: false, follow: false },
};

export default function AdminApplicationsPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Driver applications</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Oldest first. Approving grants the driver role; rejecting needs a reason
        the applicant can act on. Neither can be undone.
      </p>

      <ApplicationQueue />
    </>
  );
}
