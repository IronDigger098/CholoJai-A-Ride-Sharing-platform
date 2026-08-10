import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to book a ride with an upfront fare.',
  /* Not indexed. A sign-in form has nothing to offer a search result, and
     the canonical entry point to the product is the landing page. */
  robots: { index: false, follow: true },
};

export default function LoginPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Book a ride with a fare agreed before you travel.
      </p>

      <LoginForm />

      <p className="text-content-muted mt-6 text-sm">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </>
  );
}
