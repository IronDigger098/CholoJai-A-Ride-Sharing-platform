import type { ReactNode } from 'react';

import { RequireSession } from '@/features/auth/components/require-session';

/**
 * Shell for the driver's screens.
 *
 * Session-gated like `(rider)`, and no more than that: whether the caller is
 * an approved driver is a question the API answers on every request, and
 * duplicating it here would be a second copy of a rule that can drift.
 */
export default function DriverLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-6 py-10">
      <RequireSession>{children}</RequireSession>
    </main>
  );
}
