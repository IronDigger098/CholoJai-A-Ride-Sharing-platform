'use client';

import { hasRole, type UserRole } from '@cholojai/shared';
import { type ReactNode } from 'react';

import { useSession } from '../session';

import { RequireSession } from './require-session';

/**
 * Gate a subtree behind a role.
 *
 * Wraps `RequireSession` rather than repeating it. "Signed in as an
 * administrator" has "signed in" as a precondition, and the loading state —
 * the half-second before the refresh cookie is exchanged — has to be handled
 * once rather than in two places that can disagree.
 *
 * Like its parent, this hides a screen; it does not protect one. Every
 * endpoint behind these pages carries `@Auth(UserRole.ADMIN)`, and a role
 * read from the client is a rendering decision, never an authorisation one.
 * Someone who edits their session in a console reaches an admin screen whose
 * every request answers 403.
 */
export function RequireRole({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}): ReactNode {
  return (
    <RequireSession>
      <RoleGate role={role}>{children}</RoleGate>
    </RequireSession>
  );
}

/**
 * Split out so the hook runs only once a session exists.
 *
 * Inlining this would call `useSession` in the same component that renders
 * `RequireSession`, which means reading the session before its own guard has
 * decided anything — the check would run against a null user on every load
 * and refuse everyone for a frame.
 */
function RoleGate({
  role,
  children,
}: {
  role: UserRole;
  children: ReactNode;
}): ReactNode {
  const { user } = useSession();

  /* A refusal, not a redirect. Someone who follows a link to /admin without
     the role has not lost their session, and sending them to /login asks
     them to fix something that is not broken. */
  if (user === null || !hasRole(user.roles, role)) {
    return (
      <p role="status" className="text-content-muted py-12 text-sm">
        This area is for administrators.
      </p>
    );
  }

  return children;
}
