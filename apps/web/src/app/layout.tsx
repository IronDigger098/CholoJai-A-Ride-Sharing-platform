import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/app/providers';
import { ThemeScript } from '@/components/theme-script';
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site';

import '@/styles/globals.css';

/**
 * The root layout wraps every route in the application.
 *
 * It is a Server Component and must stay one: anything marked `'use client'`
 * here would ship the entire tree to the browser as client code. State that
 * genuinely needs the client — the theme toggle in M4.2, for instance —
 * belongs in a small client component this layout renders, not in the
 * layout itself.
 */

export const metadata: Metadata = {
  /* Makes every relative URL below — canonical, Open Graph image — resolve
     against the real deployment. Without it Next warns and emits relative
     URLs, which crawlers and social scrapers both handle badly. */
  metadataBase: new URL(siteUrl()),

  /* `template` applies to every child route that sets its own title, so
     pages declare only their own name and the brand suffix is never
     forgotten or spelled three different ways. */
  title: {
    default: `${SITE_NAME} — book a verified ride with an upfront fare`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,

  /* Points every duplicate of a page — with a tracking parameter, on a
     preview domain, reached through a redirect — at one address, so
     ranking signals accumulate in one place instead of splitting. */
  alternates: { canonical: '/' },

  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — book a verified ride with an upfront fare`,
    description: SITE_DESCRIPTION,
    url: '/',
    locale: 'en_GB',
  },

  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — book a verified ride with an upfront fare`,
    description: SITE_DESCRIPTION,
  },

  /* Indexing is allowed on purpose. This is a portfolio project rather
     than a real transport service, and the temptation is to `noindex` it
     for that reason — but being findable is most of the point, and the
     footer states plainly what it is. The `sitemap.ts` and `robots.ts`
     below would also contradict a `noindex` here, and quietly
     contradictory SEO signals are worse than either choice on its own. */
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  /* Not `maximum-scale=1`. Blocking zoom is a common default in app
     templates and it makes the product unusable for anyone who needs to
     magnify text — a WCAG 1.4.4 failure, and one nobody on the team will
     ever notice themselves. */
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    /*
     * No `data-theme` here: without one the tokens follow the operating
     * system, which is the right default. `ThemeScript` adds the attribute
     * before first paint when someone has chosen otherwise.
     *
     * `suppressHydrationWarning` is required *because* of that script. It
     * mutates <html> before React attaches, so the DOM legitimately
     * differs from the server's markup and React would otherwise report a
     * mismatch. It is scoped to this one element and suppresses nothing
     * inside it.
     */
    <html lang="en" suppressHydrationWarning>
      <body className="bg-surface text-content min-h-dvh font-sans antialiased">
        {/* First child of <body> on purpose — see ThemeScript. It has to
            run during parsing, before anything exists to paint. */}
        <ThemeScript />
        {/* The only client boundary in the layout. Everything above this
            stays a Server Component; `Providers` and its subtree ship to
            the browser. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
