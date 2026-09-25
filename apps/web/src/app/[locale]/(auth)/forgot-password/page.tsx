import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.forgot');

  return { title: t('title'), robots: { index: false, follow: true } };
}

export default async function ForgotPasswordPage(): Promise<ReactNode> {
  const t = await getTranslations('auth.forgot');
  const auth = await getTranslations('auth');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">{t('intro')}</p>

      <ForgotPasswordForm />

      <p className="text-content-muted mt-6 text-sm">
        {t('remembered')} <Link href="/login">{auth('signIn')}</Link>
      </p>
    </>
  );
}
