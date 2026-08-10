import type { ReactNode } from 'react';

import { RequireSession } from '@/features/auth/components/require-session';

/**
 * Shell for the rider's own screens.
 *
 * A route group, so `(rider)` never appears in a URL. Everything under here
 * needs a session, and putting the gate in the layout means a new page added
 * next year is protected by existing rather than by someone remembering.
 */
export default function RiderLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-6 py-10">
      <RequireSession>{children}</RequireSession>
    </main>
  );
}
