import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { CampaignManager } from '@/features/admin/components/campaign-manager';

export const metadata: Metadata = {
  title: 'Campaigns',
  robots: { index: false, follow: false },
};

export default function AdminCampaignsPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        A code discounts a fare when the quote is priced, so the number a rider
        accepts is the number they are charged. Retiring a campaign stops new
        quotes from using it; quotes already priced with it stay valid until
        they expire.
      </p>

      <CampaignManager />
    </>
  );
}
