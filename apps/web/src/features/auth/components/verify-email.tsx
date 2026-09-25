'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('auth.verify');
  const [state, setState] = useState<State>(
    token === null
      ? { kind: 'failed', message: t('missingToken') }
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
        {t('verifying')}
      </p>
    );
  }

  if (state.kind === 'verified') {
    return (
      <div role="status" className="space-y-4 text-sm">
        <p>{t('verified')}</p>
        <p>
          {t.rich('next', {
            book: (chunks) => <Link href="/book">{chunks}</Link>,
            login: (chunks) => <Link href="/login">{chunks}</Link>,
          })}
        </p>
      </div>
    );
  }

  return (
    <div role="alert" className="space-y-4 text-sm">
      <p className="text-danger">{state.message}</p>
      <p className="text-content-muted">{t('expired')}</p>
      <p>
        <Link href="/login">{t('toSignIn')}</Link>
      </p>
    </div>
  );
}
