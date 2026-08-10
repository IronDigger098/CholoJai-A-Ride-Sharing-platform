'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { useSession } from '../session';

/**
 * Gate a subtree behind a signed-in session.
 *
 * A client-side guard, and honest about being one: it hides a screen from
 * someone who is not signed in, it does not protect anything. Every endpoint
 * behind these pages is guarded server-side, which is where authorisation
 * actually lives — this exists so a signed-out visitor sees the sign-in page
 * instead of a form that 401s on submit.
 *
 * `status === 'loading'` renders nothing rather than redirecting. On a
 * reload the token is gone until the refresh cookie is exchanged, and
 * treating that moment as "signed out" would bounce a signed-in rider to
 * /login for half a second on every navigation.
 */
export function RequireSession({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <p role="status" className="text-content-muted py-12 text-sm">
        {status === 'loading' ? 'Loading…' : 'Redirecting to sign in…'}
      </p>
    );
  }

  return children;
}
