import { Suspense, type ReactNode } from 'react';

import type { Metadata } from 'next';

import { VerifyEmail } from '@/features/auth/components/verify-email';

export const metadata: Metadata = {
  title: 'Confirm your email',
  robots: { index: false, follow: false },
};

/* `Suspense` because the form reads the query string, which a statically
   rendered page only has in the browser. */
export default function VerifyEmailPage(): ReactNode {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Confirm your email</h1>
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </>
  );
}
