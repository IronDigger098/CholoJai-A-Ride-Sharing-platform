'use client';

import { UserRole } from '@cholojai/shared';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

import { Link } from '@/components/ui/link';
import { useSession } from '@/features/auth/session';
import { useRouter } from '@/i18n/navigation';

/**
 * Where a signed-in person can go, and the way out.
 *
 * Every screen behind the session gate existed, but the bar above them
 * linked only to search and settings — booking, ride history and the
 * driver's side were reachable by typing a URL and not otherwise, and
 * nothing anywhere signed you out.
 *
 * Admin appears only for admins. The admin screens refuse everyone else
 * anyway; a link that leads to a refusal is an invitation to wonder what
 * is behind it.
 */

const LINK =
  'text-content-muted hover:text-content rounded-xs text-sm no-underline';

export function AppNav(): ReactNode {
  const t = useTranslations('nav');
  const { user, signOut } = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const isAdmin = user?.roles.includes(UserRole.ADMIN) ?? false;

  async function onSignOut(): Promise<void> {
    setSigningOut(true);

    try {
      await signOut();
    } finally {
      /* Home whatever the server said. `logout` clears the local token in
         its own `finally`, so this device is signed out either way, and
         leaving someone on a screen that now 401s is the worse outcome. */
      router.replace('/');
    }
  }

  return (
    <nav aria-label={t('account')} className="flex items-center gap-4">
      <Link href="/book" className={LINK}>
        {t('book')}
      </Link>
      <Link href="/rides" className={LINK}>
        {t('rides')}
      </Link>
      <Link href="/drive" className={LINK}>
        {t('drive')}
      </Link>
      {isAdmin ? (
        <Link href="/admin" className={LINK}>
          {t('admin')}
        </Link>
      ) : null}
      <button
        type="button"
        disabled={signingOut}
        onClick={() => {
          void onSignOut();
        }}
        className={`${LINK} cursor-pointer disabled:opacity-60`}
      >
        {t('signOut')}
      </button>
    </nav>
  );
}
