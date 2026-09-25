import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { RegisterForm } from '@/features/auth/components/register-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.register');

  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: true },
  };
}

export default async function RegisterPage(): Promise<ReactNode> {
  const t = await getTranslations('auth.register');
  const auth = await getTranslations('auth');

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">{t('intro')}</p>

      <RegisterForm />

      <p className="text-content-muted mt-6 text-sm">
        {t('haveAccount')} <Link href="/login">{auth('signIn')}</Link>
      </p>
    </>
  );
}
