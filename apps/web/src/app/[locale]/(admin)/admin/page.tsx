import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PlatformMetrics } from '@/features/admin/components/platform-metrics';

export const metadata: Metadata = {
  title: 'Overview',
  robots: { index: false, follow: false },
};

export default function AdminOverviewPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Counted live from the rides and accounts themselves, so these numbers
        are current rather than as of last night.
      </p>

      <PlatformMetrics />
    </>
  );
}
