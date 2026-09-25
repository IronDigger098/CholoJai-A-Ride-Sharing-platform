import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';

import type { Metadata } from 'next';

import { VerifyEmail } from '@/features/auth/components/verify-email';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.verify');

  return { title: t('title'), robots: { index: false, follow: false } };
}

/* `Suspense` because the component reads the query string, which a
   statically rendered page only has in the browser. */
export default async function VerifyEmailPage(): Promise<ReactNode> {
  const t = await getTranslations('auth.verify');

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </>
  );
}
