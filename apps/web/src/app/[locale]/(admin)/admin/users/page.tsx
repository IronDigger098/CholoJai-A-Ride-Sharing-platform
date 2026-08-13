import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { UserDirectory } from '@/features/admin/components/user-directory';

export const metadata: Metadata = {
  title: 'Users',
  robots: { index: false, follow: false },
};

export default function AdminUsersPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Newest first. A role change takes effect on that person&apos;s next
        token refresh, within fifteen minutes.
      </p>

      <UserDirectory />
    </>
  );
}
