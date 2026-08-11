'use client';

import { type ContactMessageListQuery } from '@cholojai/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { listContactMessages, setContactMessageHandled } from '../api';

import { Button } from '@/components/ui/button';
import { toApiError } from '@/lib/api-error';

/**
 * The support inbox.
 *
 * Oldest first, which is the opposite of every other list in this app and is
 * the server's ordering rather than a choice made here. A newest-first inbox
 * pushes the messages that have waited longest onto pages nobody scrolls to.
 *
 * Handling is reversible, so the button reads both ways. A one-way checkbox
 * turns a single misclick into a message nobody ever looks at again.
 */

/** Matches the server's default; stated so the request is explicit. */
const PAGE_SIZE = 20;

export function SupportInbox(): ReactNode {
  const queryClient = useQueryClient();

  const [handled, setHandled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery({
    queryKey: ['contact-messages', handled],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      listContactMessages({
        handled,
        limit: PAGE_SIZE,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      } satisfies ContactMessageListQuery),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.pageInfo.nextCursor ?? undefined,
  });

  const amend = useMutation({
    mutationFn: setContactMessageHandled,
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['contact-messages'] });
    },
    onError: (cause: unknown) => {
      setError(toApiError(cause).message);
    },
  });

  const messages = data?.pages.flatMap((page) => page.data) ?? [];

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

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={handled ? 'ghost' : 'accent'}
          onClick={() => {
            setHandled(false);
          }}
        >
          Waiting
        </Button>
        <Button
          size="sm"
          variant={handled ? 'accent' : 'ghost'}
          onClick={() => {
            setHandled(true);
          }}
        >
          Handled
        </Button>
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

      {!isPending && messages.length === 0 && (
        <p className="text-content-muted text-sm">
          {handled ? 'Nothing has been handled yet.' : 'Nothing is waiting.'}
        </p>
      )}

      <ul className="space-y-4">
        {messages.map((message) => (
          <li
            key={message.id}
            className="border-border-strong space-y-3 rounded-md border px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {message.subject}
                </span>
                <span className="text-content-subtle block truncate text-xs">
                  {message.name} · {message.email}
                  {/* Said plainly rather than shown as an account link. The
                      address was typed and is not proof of anything; the
                      account is what the token said. */}
                  {message.userId === null ? ' · not signed in' : ''}
                </span>
              </span>

              <time
                dateTime={message.createdAt}
                className="text-content-subtle shrink-0 text-xs"
              >
                {new Date(message.createdAt).toLocaleDateString()}
              </time>
            </div>

            {/* `whitespace-pre-line` because somebody wrote paragraphs and
                collapsing them makes a long complaint unreadable. */}
            <p className="text-content-muted text-sm whitespace-pre-line">
              {message.message}
            </p>

            <Button
              size="sm"
              variant="ghost"
              disabled={amend.isPending}
              onClick={() => {
                amend.mutate({
                  messageId: message.id,
                  handled: message.handledAt === null,
                });
              }}
            >
              {message.handledAt === null ? 'Mark handled' : 'Reopen'}
            </Button>
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
