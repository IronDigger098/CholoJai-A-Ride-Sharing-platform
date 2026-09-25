import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ContactForm } from '@/features/contact/components/contact-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contact');

  return { title: t('title'), description: t('description') };
}

/**
 * The contact page.
 *
 * Outside every route group, because it belongs to none of them. `(rider)`,
 * `(driver)` and `(admin)` all gate on a session, and the whole point of
 * this page is that it works without one.
 */
export default async function ContactPage(): Promise<ReactNode> {
  const t = await getTranslations('contact');

  return (
    <>
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('title')}</h1>
        <p className="text-content-muted mt-3 mb-10 text-sm">{t('intro')}</p>

        <ContactForm />
      </main>

      <SiteFooter />
    </>
  );
}
