'use client';

import { type UserSummary } from '@cholojai/shared';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  login as loginRequest,
  logout as logoutRequest,
  restoreSession,
} from './api';

import { accessToken } from '@/lib/access-token';

/**
 * Who is signed in, for the whole client tree.
 *
 * `status` is three values rather than a boolean, and the third is the one
 * that matters. On a reload the token is gone and the refresh cookie has not
 * been exchanged yet, so "not signed in" and "we do not know yet" are
 * genuinely different — collapsing them redirects a signed-in user to the
 * login page for the half-second before their session comes back.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface Session {
  readonly status: SessionStatus;
  readonly user: UserSummary | null;
  /* Function-typed properties rather than method shorthand. These are
     stable `useCallback` values that callers destructure, and method
     syntax makes `unbound-method` warn about a `this` neither of them has. */
  readonly signIn: (email: string, password: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    restoreSession()
      .then((session) => {
        if (cancelled) return;
        setUser(session.user);
        setStatus('authenticated');
      })
      .catch(() => {
        /* No cookie, or a revoked family. Not an error to report — it is
           what "signed out" looks like on a first visit. */
        if (cancelled) return;
        accessToken.clear();
        setStatus('anonymous');
      });

    /* React runs effects twice in development Strict Mode. Without this
       flag the second run's result can land after the first's and set state
       on an unmounted tree. */
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      const session = await loginRequest({ email, password });
      setUser(session.user);
      setStatus('authenticated');
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await logoutRequest();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<Session>(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

/**
 * Read the session.
 *
 * Throws outside a provider rather than returning a null session. A
 * component rendered outside the tree would otherwise silently believe
 * nobody is signed in and render its signed-out branch forever, which is a
 * bug that looks like a design decision.
 */
export function useSession(): Session {
  const session = use(SessionContext);

  if (session === null) {
    throw new Error('useSession must be used inside a SessionProvider');
  }

  return session;
}
