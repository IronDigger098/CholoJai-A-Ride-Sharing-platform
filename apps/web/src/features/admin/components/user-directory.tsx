'use client';

import { hasRole, type UserListQuery, UserRole } from '@cholojai/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { grantRole, listUsers, revokeRole } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * The user directory, and the roles an administrator can change from it.
 *
 * Search is submitted rather than debounced. A debounce is right for the
 * place lookup on the booking screen, where the rider is choosing between
 * suggestions as they type; here the administrator has a whole name or
 * address in mind and presses enter once. Firing a query per keystroke would
 * buy nothing and cost a request each.
 */

/** Matches the server's default; stated so the request is explicit. */
const PAGE_SIZE = 20;

/**
 * RIDER is absent on purpose.
 *
 * Every account holds it and the API refuses to revoke it, so a control for
 * it could only ever fail. It is shown as a fact about the account instead.
 */
const MANAGEABLE = [UserRole.DRIVER, UserRole.ADMIN] as const;

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.RIDER]: 'Rider',
  [UserRole.DRIVER]: 'Driver',
  [UserRole.ADMIN]: 'Admin',
};

export function UserDirectory(): ReactNode {
  const queryClient = useQueryClient();
  const id = useId();

  /* Two states, not one. `draft` is what has been typed; `filter` is what
     has been asked for. Collapsing them would make every keystroke a new
     query key, which is the debounce this screen deliberately does not do. */
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<{ q: string; role: UserRole | '' }>({
    q: '',
    role: '',
  });
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery({
    queryKey: ['admin-users', filter.q, filter.role],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listUsers({
        limit: PAGE_SIZE,
        ...(filter.q === '' ? {} : { q: filter.q }),
        ...(filter.role === '' ? {} : { role: filter.role }),
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      } satisfies UserListQuery),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.pageInfo.nextCursor ?? undefined,
  });

  function settle(): void {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  }

  function fail(cause: unknown): void {
    setError(toApiError(cause).message);
  }

  const grant = useMutation({
    mutationFn: grantRole,
    onSuccess: settle,
    onError: fail,
  });

  const revoke = useMutation({
    mutationFn: revokeRole,
    onSuccess: settle,
    onError: fail,
  });

  function onSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFilter({ ...filter, q: draft.trim() });
  }

  const users = data?.pages.flatMap((page) => page.data) ?? [];
  const busy = grant.isPending || revoke.isPending;

  return (
    <div className="space-y-6">
      {error !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <form onSubmit={onSearch} noValidate className="flex items-end gap-3">
        <span className="flex-1">
          <Field
            id={`${id}-q`}
            label="Search"
            hint="Matches a name or an email address."
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
        </span>

        <Button type="submit">Search</Button>
      </form>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-role`} className="block text-sm font-medium">
          Role
        </label>
        <select
          id={`${id}-role`}
          value={filter.role}
          onChange={(event) => {
            setFilter({ ...filter, role: event.target.value as UserRole | '' });
          }}
          className="border-border-strong bg-surface text-content h-11 rounded-md border px-3 text-sm"
        >
          <option value="">Everyone</option>
          {MANAGEABLE.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role]}
            </option>
          ))}
        </select>
      </div>

      {isPending && (
        <p role="status" className="text-content-muted text-sm">
          Loading…
        </p>
      )}

      {queryError !== null && (
        <p role="alert" className="text-danger text-sm">
          {toApiError(queryError).message}
        </p>
      )}

      {!isPending && users.length === 0 && (
        <p className="text-content-muted text-sm">Nobody matches that.</p>
      )}

      <ul className="space-y-3">
        {users.map((user) => (
          <li
            key={user.id}
            className="border-border-strong space-y-3 rounded-md border px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {user.fullName}
                </span>
                <span className="text-content-subtle block truncate text-xs">
                  {user.email}
                  {user.emailVerified ? '' : ' · unverified'}
                </span>
              </span>

              <span className="text-content-subtle shrink-0 text-xs">
                {user.roles.map((role) => ROLE_LABEL[role]).join(' · ')}
              </span>
            </div>

            <span className="flex flex-wrap gap-2">
              {MANAGEABLE.map((role) =>
                hasRole(user.roles, role) ? (
                  <Button
                    key={role}
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      revoke.mutate({ userId: user.id, role });
                    }}
                  >
                    Remove {ROLE_LABEL[role].toLowerCase()}
                  </Button>
                ) : (
                  <Button
                    key={role}
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      grant.mutate({ userId: user.id, role });
                    }}
                  >
                    Make {ROLE_LABEL[role].toLowerCase()}
                  </Button>
                ),
              )}
            </span>
          </li>
        ))}
      </ul>

      {hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => {
            void fetchNextPage();
          }}
          disabled={isFetchingNextPage}
          className="w-full"
        >
          {isFetchingNextPage ? 'Loading…' : 'Show more'}
        </Button>
      )}
    </div>
  );
}
