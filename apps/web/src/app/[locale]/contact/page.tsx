import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ContactForm } from '@/features/contact/components/contact-form';

export const metadata: Metadata = {
  title: 'Contact us',
  description:
    'Write to CholoJai about a ride, an account, or driving with us. No ' +
    'account needed.',
};

/**
 * The contact page.
 *
 * Outside every route group, because it belongs to none of them. `(rider)`,
 * `(driver)` and `(admin)` all gate on a session, and the whole point of
 * this page is that it works without one.
 */
export default function ContactPage(): ReactNode {
  return (
    <>
      <SiteHeader />

      <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Contact us</h1>
        <p className="text-content-muted mt-3 mb-10 text-sm">
          A problem with a ride, a question about your account, or anything
          else. You do not need an account to write to us — if you are signed
          in, we will see which one is yours.
        </p>

        <ContactForm />
      </main>

      <SiteFooter />
    </>
  );
}
