'use client';

import {
  formatTaka,
  type Paisa,
  SEARCH_KIND_ORDER,
  type SearchResult,
  type SearchResultKind,
  SearchResultKind as Kind,
} from '@cholojai/shared';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useState } from 'react';

import { search } from '../api';

import { Field } from '@/components/ui/field';
import { Link } from '@/components/ui/link';
import { toApiError } from '@/lib/api-error';

/** Same debounce as the booking place search, for the same reason. */
const DEBOUNCE_MS = 300;

/** Matches the server's minimum. Below it, no request is worth making. */
const MIN_QUERY_LENGTH = 2;

/**
 * One box over saved places, past rides and help.
 *
 * Rendered as sections in `SEARCH_KIND_ORDER`, which is the order the server
 * already sorted them into — the constant is shared so the two cannot drift.
 * There is no relevance score anywhere in this file, because there is none
 * on the wire: a number ranking a ride against a help article would be
 * invented, and the grouping is what replaces it.
 */
export function SearchScreen(): ReactNode {
  const id = useId();
  const t = useTranslations('search');
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(text);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [text]);

  const query = debounced.trim();
  const enabled = query.length >= MIN_QUERY_LENGTH;

  const { data, error, isFetching } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query),
    enabled,
  });

  const results = data?.results ?? [];

  return (
    /* No max-width or padding here: the rider layout already supplies both,
       and a second set would inset this screen further than every other one
       under the same shell. */
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <Field
        id={id}
        label={t('label')}
        type="search"
        value={text}
        autoComplete="off"
        placeholder={t('placeholder')}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />

      {error !== null && (
        <p role="alert" className="text-danger text-sm">
          {toApiError(error).message}
        </p>
      )}

      {/* Two characters, stated rather than left as silence. A box that
          does nothing for one character reads as broken. */}
      {!enabled && (
        <p className="text-content-muted text-sm">
          {t('minLength', { min: MIN_QUERY_LENGTH })}
        </p>
      )}

      {enabled && isFetching && (
        <p role="status" className="text-content-muted text-sm">
          {t('searching')}
        </p>
      )}

      {enabled && !isFetching && results.length === 0 && (
        <p role="status" className="text-content-muted text-sm">
          {t('empty', { query })}
        </p>
      )}

      {SEARCH_KIND_ORDER.map((kind) => {
        const group = results.filter((result) => result.kind === kind);

        if (group.length === 0) return null;

        return (
          <section key={kind} className="space-y-2">
            {/* From the catalogue, not `SEARCH_KIND_LABEL`. The shared
                constant still names the groups for anything without a
                translator — the API docs, a future export — but a screen
                that reads it would print English headings above Bangla
                results. The order still comes from the shared constant;
                only the words are local. */}
            <h2 className="text-content-muted text-sm font-medium">
              {t(`kind.${kind}`)}
            </h2>

            <ul className="space-y-2">
              {group.map((result) => (
                <li
                  key={keyOf(result)}
                  className="border-border-strong rounded-md border px-4 py-3"
                >
                  <ResultRow result={result} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One result, drawn according to what it actually is.
 *
 * A switch over the discriminant rather than a shared `{ title, subtitle }`
 * shape. A ride wants its fare and its date, a place wants its address, and
 * an article wants its answer — flattening all three into two lines would
 * throw away the part that makes each one useful.
 */
function ResultRow({ result }: { readonly result: SearchResult }): ReactNode {
  /* `useFormatter`, not `toLocaleDateString`. The browser's locale is
     whatever the device is set to, which for a Bangla reader on an
     English phone is the wrong one — and it would disagree with every
     other string on the screen. This formats against the locale the page
     is actually in, in the Dhaka time zone set in `request.ts`. */
  const format = useFormatter();

  switch (result.kind) {
    case Kind.PLACE:
      return (
        <>
          <span className="block text-sm font-medium">{result.label}</span>
          <span className="text-content-muted block text-sm">
            {result.address}
          </span>
        </>
      );

    case Kind.RIDE:
      return (
        <Link href={`/rides/${result.id}`} className="block">
          <span className="block text-sm font-medium">
            {result.pickupAddress} → {result.dropoffAddress}
          </span>
          <span className="text-content-muted block text-sm">
            {format.dateTime(new Date(result.requestedAt), {
              dateStyle: 'medium',
            })}{' '}
            · {formatTaka(result.farePaisa as Paisa)}
          </span>
        </Link>
      );

    case Kind.HELP:
      return (
        <>
          <span className="block text-sm font-medium">{result.question}</span>
          <span className="text-content-muted block text-sm">
            {result.answer}
          </span>
        </>
      );
  }
}

/** Ids are unique within a kind, not across kinds — so the kind is part of it. */
function keyOf(result: SearchResult): string {
  const own: string = result.kind === Kind.HELP ? result.slug : result.id;

  return `${result.kind satisfies SearchResultKind}:${own}`;
}
