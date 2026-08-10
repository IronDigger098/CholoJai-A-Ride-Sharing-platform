import { UserRole } from '@cholojai/shared';

import type { ReactNode } from 'react';

import { AppHeader } from '@/components/layout/app-header';
import { Link } from '@/components/ui/link';
import { RequireRole } from '@/features/auth/components/require-role';

/**
 * Shell for the administrative screens.
 *
 * Role-gated rather than merely session-gated, which is the one way this
 * differs from `(rider)` and `(driver)`. Those hide screens whose requests a
 * signed-in stranger would simply fail; these exist to act on other people's
 * accounts, and showing an empty review queue to a rider invites them to
 * wonder what they are missing.
 *
 * Wider than the other groups because these screens are lists, not forms.
 */

const SECTIONS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/applications', label: 'Driver applications' },
  { href: '/admin/users', label: 'Users' },
] as const;

export default function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <RequireRole role={UserRole.ADMIN}>
      <AppHeader />

      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-10">
        <nav
          aria-label="Admin"
          className="border-border mb-8 flex gap-5 border-b pb-4"
        >
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="text-content-muted hover:text-content text-sm font-medium no-underline"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        {children}
      </main>
    </RequireRole>
  );
}
