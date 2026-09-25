import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';

import type { Metadata } from 'next';

import { Link } from '@/components/ui/link';
import { LoginForm } from '@/features/auth/components/login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');

  return {
    title: t('title'),
    description: t('description'),
    /* Not indexed. A sign-in form has nothing to offer a search result, and
       the canonical entry point to the product is the landing page. */
    robots: { index: false, follow: true },
  };
}

export default async function LoginPage(): Promise<ReactNode> {
  const t = await getTranslations('auth.login');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">{t('intro')}</p>

      {/* `Suspense` because the form reads `?next=` from the query
          string, which a statically rendered page only has in the browser. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <p className="text-content-muted mt-6 text-sm">
        <Link href="/forgot-password">{t('forgot')}</Link>
      </p>
      <p className="text-content-muted mt-2 text-sm">
        {t('newHere')} <Link href="/register">{t('createLink')}</Link>
      </p>
    </>
  );
}
