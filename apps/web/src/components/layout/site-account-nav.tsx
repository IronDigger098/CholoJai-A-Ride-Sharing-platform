'use client';

import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

import { Link } from '@/components/ui/link';
import { LinkButton } from '@/components/ui/link-button';
import { useSession } from '@/features/auth/session';

/**
 * The landing page's way into the product.
 *
 * The header used to have none — its comment said the auth pages did not
 * exist yet, which stopped being true in M6 while the header stayed as it
 * was. A visitor could read about booking a ride and had no path to do it.
 *
 * Nothing renders while the session is still being restored. Showing
 * "Sign in" for the half-second before a returning rider's session comes
 * back would offer them the wrong door and then swap it under the cursor.
 */
export function SiteAccountNav(): ReactNode {
  const t = useTranslations('nav');
  const { status } = useSession();

  if (status === 'loading') return null;

  if (status === 'authenticated') {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/rides"
          className="text-content-muted hover:text-content hidden text-sm font-medium no-underline sm:inline"
        >
          {t('rides')}
        </Link>
        <LinkButton href="/book" size="sm">
          {t('book')}
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/login"
        className="text-content-muted hover:text-content text-sm font-medium no-underline"
      >
        {t('signIn')}
      </Link>
      <LinkButton href="/register" size="sm">
        {t('signUp')}
      </LinkButton>
    </div>
  );
}
