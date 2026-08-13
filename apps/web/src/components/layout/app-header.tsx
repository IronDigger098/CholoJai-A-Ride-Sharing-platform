import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
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
  /* `useTranslations`, not `getTranslations`, and this stays a Server
     Component. The hook works in both — on the server it reads the
     request's messages during render and ships none of them to the
     browser. */
  const t = useTranslations('nav');
  const common = useTranslations('common');

  return (
    <header className="border-border bg-surface/85 sticky top-0 z-10 border-b backdrop-blur">
      {/* The skip link belongs to whatever chrome sits above the content.
          Introducing a header without one means every keyboard user tabs
          through it on every page before reaching anything. */}
      <a
        href="#main"
        className="bg-accent text-accent-content focus:ring-accent sr-only rounded-md px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        {common('skipToContent')}
      </a>

      <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-3">
        <Link
          href="/"
          className="rounded-xs text-base font-semibold tracking-tight no-underline"
        >
          {/* The brand is in the catalogue and identical in both files.
              That is deliberate rather than an oversight: a name is a name,
              and holding it as a message means transliterating it later is
              a data change instead of a code change. */}
          {t('brand')}
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/search"
            className="text-content-muted hover:text-content rounded-xs text-sm no-underline"
          >
            {t('search')}
          </Link>
          <NotificationBell />
          <Link
            href="/settings"
            className="text-content-muted hover:text-content rounded-xs text-sm no-underline"
          >
            {t('settings')}
          </Link>
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
