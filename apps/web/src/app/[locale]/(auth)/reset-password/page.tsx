import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';

import type { Metadata } from 'next';

import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.reset');

  return { title: t('title'), robots: { index: false, follow: false } };
}

export default async function ResetPasswordPage(): Promise<ReactNode> {
  const t = await getTranslations('auth.reset');

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
