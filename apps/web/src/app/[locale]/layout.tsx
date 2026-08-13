import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '@/app/providers';
import { ThemeScript } from '@/components/theme-script';
import { routing } from '@/i18n/routing';
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site';

import '@/styles/globals.css';

/**
 * The root layout wraps every route in the application.
 *
 * It lives under `[locale]` and there is no `app/layout.tsx` above it —
 * Next treats the highest layout it finds as the root, and this is the only
 * place that can carry `<html lang>` because the language is not known any
 * higher up. A second layout above it could not name the locale, so it
 * would render `lang="en"` over Bangla text: a screen reader would then
 * pronounce every word with English phonetics.
 *
 * It is a Server Component and must stay one: anything marked `'use client'`
 * here would ship the entire tree to the browser as client code. State that
 * genuinely needs the client — the theme toggle in M4.2, for instance —
 * belongs in a small client component this layout renders, not in the
 * layout itself.
 */

/**
 * Both locales, built at build time.
 *
 * Without this every page becomes dynamic, because the router cannot know
 * which values of `[locale]` exist. Two entries is the whole list, so
 * enumerating it costs nothing and buys back static rendering.
 */
export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

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
     ranking signals accumulate in one place instead of splitting.
     `languages` is the other half of that since M10b: it tells a crawler
     the English and Bangla pages are one page in two languages rather than
     two pages competing, and which reader each is for. `x-default` names
     the one to show somebody whose language is neither. */
  alternates: {
    canonical: '/',
    languages: {
      en: '/',
      bn: '/bn',
      'x-default': '/',
    },
  },

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

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>): Promise<ReactNode> {
  const { locale } = await params;

  /* A URL is whatever a stranger typed. `/xx/book` reaches here with 'xx',
     and rendering it would produce a page in the default language sitting
     at an address that claims to be another one — indexed, shareable and
     wrong. 404 is the honest answer. */
  if (!hasLocale(routing.locales, locale)) notFound();

  /* Opts this subtree into static rendering. Without it the first call to
     `useTranslations` in any child reads headers, which makes the whole
     route dynamic — every page rendered per request to produce identical
     output. */
  setRequestLocale(locale);

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
    <html lang={locale} suppressHydrationWarning>
      <body className="bg-surface text-content min-h-dvh font-sans antialiased">
        {/* First child of <body> on purpose — see ThemeScript. It has to
            run during parsing, before anything exists to paint. */}
        <ThemeScript />
        {/* The only client boundary in the layout. Everything above this
            stays a Server Component; `Providers` and its subtree ship to
            the browser.

            `NextIntlClientProvider` takes no props: it reads the locale and
            messages resolved for this request and hands them to every
            client component below. Passing them explicitly would work and
            would also mean every layout that forgets is a component that
            renders message keys instead of words. */}
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
