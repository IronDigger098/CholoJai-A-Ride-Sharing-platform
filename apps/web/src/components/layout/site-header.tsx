import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * The site header.
 *
 * There is no "Sign in" link, and that is deliberate rather than an
 * oversight: the auth pages do not exist yet, and a link to a route that
 * 404s is worse than no link. It arrives with those pages.
 */

/** Fragment targets paired with their message key. */
const SECTIONS = [
  { href: '#how-it-works', key: 'howItWorks' },
  { href: '#fares', key: 'fares' },
  { href: '#safety', key: 'safety' },
  { href: '#drive', key: 'drive' },
] as const;

export function SiteHeader(): ReactNode {
  const t = useTranslations('site');
  const common = useTranslations('common');

  return (
    <header className="border-border bg-surface/85 sticky top-0 z-10 border-b backdrop-blur">
      {/*
       * The skip link. Keyboard and screen-reader users otherwise tab
       * through every navigation item on every page before reaching the
       * content. Visually hidden until focused, at which point it must be
       * clearly visible — a skip link that stays invisible when focused is
       * the most common way this feature is implemented and broken at the
       * same time.
       */}
      <a
        href="#main"
        className="bg-accent text-accent-content focus:ring-accent sr-only rounded-md px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        {common('skipToContent')}
      </a>

      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
        <a
          href="#main"
          className="rounded-xs text-lg font-semibold tracking-tight"
        >
          CholoJai
          {/* The Bangla tagline is beside the name in *both* languages —
              it is part of the wordmark, not a translation of it. In the
              Bangla catalogue it is therefore the same string, and
              deliberately so: a brand that renders differently depending
              on the reader is two brands. */}
          <span className="text-accent ml-2 text-sm font-medium">
            {t('tagline')}
          </span>
        </a>

        {/* The landmark's own name, not one of the links inside it. A
            screen reader announces "Sections, navigation" to distinguish
            this from any other nav on the page, so labelling it "How it
            works" would name the landmark after its first child. */}
        <nav
          aria-label={t('sectionsNav')}
          className="ml-auto hidden gap-6 md:flex"
        >
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="text-content-muted hover:text-content text-sm font-medium no-underline"
            >
              {t(`sections.${section.key}`)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
