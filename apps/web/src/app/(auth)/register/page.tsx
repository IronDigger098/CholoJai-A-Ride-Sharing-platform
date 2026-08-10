import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { RegisterForm } from '@/features/auth/components/register-form';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create a CholoJai account to book verified rides.',
  robots: { index: false, follow: true },
};

export default function RegisterPage(): ReactNode {
  return (
    <>
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <p className="text-content-muted mt-2 mb-8 text-sm">
        You will need to verify your email address before your first ride.
      </p>

      <RegisterForm />

      <p className="text-content-muted mt-6 text-sm">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  );
}
