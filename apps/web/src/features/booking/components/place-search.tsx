'use client';

import { type Place } from '@cholojai/shared';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useId, useState } from 'react';

import { searchPlaces } from '../api';

import { Field } from '@/components/ui/field';

/**
 * Pick a place by name.
 *
 * A listbox rather than a datalist. `<datalist>` looks like a free win, but
 * its options cannot be styled, keyboard behaviour differs between browsers,
 * and on several it silently caps how many it will show — none of which is
 * acceptable for the control that decides where someone is driven.
 */

/** Long enough that a fast typist makes one request, not eight. */
const DEBOUNCE_MS = 300;

/** Matches the server's minimum: a shorter query matches most of the country. */
const MIN_QUERY_LENGTH = 2;

export interface PlaceSearchProps {
  readonly label: string;
  readonly value: Place | null;
  readonly onSelect: (place: Place) => void;
}

export function PlaceSearch({
  label,
  value,
  onSelect,
}: PlaceSearchProps): ReactNode {
  const id = useId();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(text);
    }, DEBOUNCE_MS);

    /* Clearing on every keystroke is what makes this a debounce rather than
       a queue of eight pending requests that all resolve out of order. */
    return () => {
      clearTimeout(timer);
    };
  }, [text]);

  const enabled = debounced.trim().length >= MIN_QUERY_LENGTH;

  const { data: places = [], isFetching } = useQuery({
    queryKey: ['places', debounced],
    queryFn: () => searchPlaces(debounced),
    enabled,
    /* Addresses do not move, and the server caches these anyway. Keeping
       them fresh for the session means re-typing a query is instant. */
    staleTime: Number.POSITIVE_INFINITY,
  });

  /* A selection that still matches what is typed is not a new search. */
  const showList = enabled && value?.label !== text;

  return (
    <div className="relative">
      <Field
        id={id}
        label={label}
        value={text}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-listbox`}
        placeholder="Search for a place"
        onChange={(event) => {
          setText(event.target.value);
        }}
      />

      {showList && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          aria-label={`${label} results`}
          className="border-border-strong bg-surface-raised absolute z-10 mt-1 w-full overflow-hidden rounded-md border"
        >
          {places.length === 0 && (
            <li className="text-content-muted px-3 py-2 text-sm">
              {isFetching ? 'Searching…' : 'No places found'}
            </li>
          )}

          {places.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                role="option"
                aria-selected={value?.id === place.id}
                onClick={() => {
                  onSelect(place);
                  setText(place.label);
                }}
                className="hover:bg-surface w-full px-3 py-2 text-left text-sm"
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
