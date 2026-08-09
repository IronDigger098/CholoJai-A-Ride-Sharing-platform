import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * The site header.
 *
 * There is no "Sign in" link, and that is deliberate rather than an
 * oversight: the auth pages do not exist yet, and a link to a route that
 * 404s is worse than no link. It arrives with those pages.
 */

const SECTIONS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#fares', label: 'Fares' },
  { href: '#safety', label: 'Safety' },
  { href: '#drive', label: 'Drive with us' },
] as const;

export function SiteHeader(): ReactNode {
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
        Skip to content
      </a>

      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
        <a
          href="#main"
          className="rounded-xs text-lg font-semibold tracking-tight"
        >
          CholoJai
          <span className="text-accent ml-2 text-sm font-medium">চলো যাই</span>
        </a>

        <nav aria-label="Sections" className="ml-auto hidden gap-6 md:flex">
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

        <div className="ml-auto md:ml-0">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
