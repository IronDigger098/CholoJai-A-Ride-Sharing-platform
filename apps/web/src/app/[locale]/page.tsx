import { setRequestLocale } from 'next-intl/server';

import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { DriverInvitation } from '@/features/marketing/components/driver-invitation';
import { FareBreakdown } from '@/features/marketing/components/fare-breakdown';
import { Hero } from '@/features/marketing/components/hero';
import { HowItWorks } from '@/features/marketing/components/how-it-works';
import { Safety } from '@/features/marketing/components/safety';
import { StructuredData } from '@/features/marketing/components/structured-data';

/**
 * The landing page.
 *
 * A route file that composes and does not implement, per
 * `docs/folder-structure.md`. Each section is a feature-private component;
 * this file's whole job is their order, which is the only thing about the
 * page that belongs to the route rather than to any one section.
 *
 * Entirely a Server Component. The only client code on this page is the
 * theme toggle, so that is the only JavaScript a visitor downloads to make
 * it interactive.
 */
export default async function HomePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<ReactNode> {
  const { locale } = await params;

  /* Repeated from the layout, and necessarily so: `setRequestLocale` is
     per-render-tree, and a page that omits it opts *itself* back into
     dynamic rendering even though its layout did not. Every page under
     `[locale]` that renders a translation needs this line. */
  setRequestLocale(locale);

  return (
    <>
      <StructuredData />

      <SiteHeader />

      {/* `id` and `tabIndex={-1}` are the other half of the skip link: an
          element that is not normally focusable will not take focus when a
          fragment points at it, so the link would move the scroll position
          and leave the keyboard where it was. */}
      <main id="main" tabIndex={-1}>
        <Hero />
        <HowItWorks />
        <FareBreakdown />
        <Safety />
        <DriverInvitation />
      </main>

      <SiteFooter />
    </>
  );
}
