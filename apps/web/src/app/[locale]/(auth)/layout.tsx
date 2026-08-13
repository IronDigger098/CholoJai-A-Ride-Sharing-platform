import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { SITE_NAME } from '@/lib/site';

/**
 * Shell for the sign-in and register screens.
 *
 * A route group, so `(auth)` never appears in a URL — the pages are `/login`
 * and `/register`. Deliberately without the marketing header and footer: a
 * page whose only job is one form should not offer twelve other places to
 * go, and the way back to the site is the one link at the top.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12"
    >
      <Link href="/" className="text-content-subtle mb-8 text-sm">
        ← {SITE_NAME}
      </Link>

      {children}
    </main>
  );
}
