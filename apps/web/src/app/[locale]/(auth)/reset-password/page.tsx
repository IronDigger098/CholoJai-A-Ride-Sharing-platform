import { Suspense, type ReactNode } from 'react';

import type { Metadata } from 'next';

import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage(): ReactNode {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Choose a new password</h1>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
