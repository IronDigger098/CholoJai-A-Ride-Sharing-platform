import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SupportInbox } from '@/features/contact/components/support-inbox';

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
};

export default function AdminMessagesPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Messages</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Longest waiting first, so nothing sinks. Marking one handled takes it
        off this list and is reversible — replies are sent from your own mail,
        not from here.
      </p>

      <SupportInbox />
    </>
  );
}
