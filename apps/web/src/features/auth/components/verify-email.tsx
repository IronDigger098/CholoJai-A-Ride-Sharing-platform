'use client';

import { useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { verifyEmail } from '../api';

import { Link } from '@/components/ui/link';
import { toApiError } from '@/lib/api-error';

type State =
  | { readonly kind: 'verifying' }
  | { readonly kind: 'verified' }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * The page the verification email links to.
 *
 * It existed on the API since M3 and nowhere on the web — so every
 * verification link in every email opened a 404.
 *
 * Posts once. Strict Mode mounts effects twice in development, and a
 * single-use token spent by the first call makes the second fail, which
 * would show "this link has expired" to someone whose address was just
 * confirmed. The ref is what stops that.
 */
export function VerifyEmail(): ReactNode {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<State>(
    token === null
      ? { kind: 'failed', message: 'This link is missing its token.' }
      : { kind: 'verifying' },
  );
  const sent = useRef(false);

  useEffect(() => {
    if (token === null || sent.current) return;
    sent.current = true;

    verifyEmail({ token })
      .then(() => {
        setState({ kind: 'verified' });
      })
      .catch((cause: unknown) => {
        setState({ kind: 'failed', message: toApiError(cause).message });
      });
  }, [token]);

  if (state.kind === 'verifying') {
    return (
      <p role="status" className="text-content-muted text-sm">
        Confirming your address…
      </p>
    );
  }

  if (state.kind === 'verified') {
    return (
      <div role="status" className="space-y-4 text-sm">
        <p>Your email address is confirmed.</p>
        <p>
          <Link href="/book">Book a ride</Link> or{' '}
          <Link href="/login">sign in</Link> if you are not already.
        </p>
      </div>
    );
  }

  return (
    <div role="alert" className="space-y-4 text-sm">
      <p className="text-danger">{state.message}</p>
      <p className="text-content-muted">
        Links expire after 24 hours and work once. You can still sign in and use
        CholoJai while your address is unconfirmed.
      </p>
      <p>
        <Link href="/login">Go to sign in</Link>
      </p>
    </div>
  );
}
