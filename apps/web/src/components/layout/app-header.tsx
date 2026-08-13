import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { NotificationBell } from '@/features/notifications/components/notification-bell';

/**
 * The bar above every signed-in screen.
 *
 * Not `SiteHeader`, which advertises sections of a landing page to a
 * visitor. This one carries the two things a signed-in person needs no
 * matter which screen they are on: a way back, and anything waiting for
 * them.
 *
 * Rendered inside the session gate, never above it. The bell asks the API
 * for notifications on mount, and doing that for a signed-out visitor would
 * be a guaranteed 401 on every page they can reach.
 */
export function AppHeader(): ReactNode {
  return (
    <header className="border-border bg-surface/85 sticky top-0 z-10 border-b backdrop-blur">
      {/* The skip link belongs to whatever chrome sits above the content.
          Introducing a header without one means every keyboard user tabs
          through it on every page before reaching anything. */}
      <a
        href="#main"
        className="bg-accent text-accent-content focus:ring-accent sr-only rounded-md px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-3">
        <Link
          href="/"
          className="rounded-xs text-base font-semibold tracking-tight no-underline"
        >
          CholoJai
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/search"
            className="text-content-muted hover:text-content rounded-xs text-sm no-underline"
          >
            Search
          </Link>
          <NotificationBell />
          <Link
            href="/settings"
            className="text-content-muted hover:text-content rounded-xs text-sm no-underline"
          >
            Settings
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
