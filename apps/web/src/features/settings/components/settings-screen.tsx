'use client';

import { type ReactNode } from 'react';

import { NotificationPreferences } from './notification-preferences';
import { PasswordForm } from './password-form';
import { ProfileForm } from './profile-form';

import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useSession } from '@/features/auth/session';

/**
 * Everything a person changes about their own account, on one page.
 *
 * Four unrelated things sharing a screen because that is where people look
 * for them, separated by rules rather than headings alone — each section is
 * its own form with its own submit, so saving a name cannot fail because a
 * password field is empty.
 */
export function SettingsScreen(): ReactNode {
  const { user } = useSession();

  /* The layout already gates on a session, so this is a render-order guard
     rather than an auth check: the provider resolves a tick after mount. */
  if (user === null) {
    return (
      <p role="status" className="text-content-muted text-sm">
        Loading…
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <ProfileForm user={user} />

      <hr className="border-border" />

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Appearance</h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-content-muted text-sm">
            Light or dark. Follows your device unless you choose.
          </p>
          <ThemeToggle />
        </div>
      </section>

      <hr className="border-border" />

      <NotificationPreferences />

      <hr className="border-border" />

      <PasswordForm />
    </div>
  );
}
