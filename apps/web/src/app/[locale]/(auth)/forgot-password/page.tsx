import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        Enter the address you signed up with and we will email you a link.
      </p>

      <ForgotPasswordForm />

      <p className="text-content-muted mt-6 text-sm">
        Remembered it? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
