'use client';

import { MAX_SAVED_PLACES, type Place } from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { PlaceSearch } from '../../booking/components/place-search';
import { createSavedPlace, deleteSavedPlace, listSavedPlaces } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

const SAVED_PLACES_KEY = ['saved-places'];

/**
 * A rider's shortlist of addresses.
 *
 * The address is picked through the same `PlaceSearch` the booking form
 * uses, not typed free-hand — because a saved place is only useful if it
 * carries coordinates, and a text box produces a string nobody can route
 * from. Reusing the control also means the two screens cannot disagree about
 * what counts as a place.
 */
export function SavedPlaces(): ReactNode {
  const labelId = useId();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState('');
  const [place, setPlace] = useState<Place | null>(null);

  const { data, error, isPending } = useQuery({
    queryKey: SAVED_PLACES_KEY,
    queryFn: listSavedPlaces,
  });

  const add = useMutation({
    mutationFn: createSavedPlace,
    onSuccess: async () => {
      setLabel('');
      setPlace(null);
      await queryClient.invalidateQueries({ queryKey: SAVED_PLACES_KEY });
    },
  });

  const remove = useMutation({
    mutationFn: deleteSavedPlace,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SAVED_PLACES_KEY });
    },
  });

  const places = data?.places ?? [];
  const full = places.length >= MAX_SAVED_PLACES;
  const ready = label.trim().length > 0 && place !== null;

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (place === null) return;

    add.mutate({
      label: label.trim(),
      address: place.label,
      coordinates: place.coordinates,
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Saved places</h2>

      <p className="text-content-muted text-sm">
        Somewhere you go often. Saved places appear in search, so you can find
        them by whatever you called them.
      </p>

      {isPending && (
        <p role="status" className="text-content-muted text-sm">
          Loading…
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-danger text-sm">
          {toApiError(error).message}
        </p>
      )}

      {places.length > 0 && (
        <ul className="space-y-2">
          {places.map((saved) => (
            <li
              key={saved.id}
              className="border-border-strong flex items-center justify-between gap-4 rounded-md border px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{saved.label}</span>
                <span className="text-content-muted block truncate text-sm">
                  {saved.address}
                </span>
              </span>

              <Button
                type="button"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(saved.id);
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!isPending && places.length === 0 && (
        <p className="text-content-muted text-sm">Nothing saved yet.</p>
      )}

      {remove.error !== null && (
        <p role="alert" className="text-danger text-sm">
          {toApiError(remove.error).message}
        </p>
      )}

      {/* The form disappears at the limit rather than failing on submit. A
          control that is present and always refuses is worse than one that
          says why it is gone. */}
      {full ? (
        <p className="text-content-muted text-sm">
          You have saved {String(MAX_SAVED_PLACES)} places, which is the most we
          keep. Remove one to add another.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <Field
            id={labelId}
            label="What do you call it?"
            value={label}
            maxLength={60}
            placeholder="Home, Office, Ma's place"
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />

          <PlaceSearch label="Which place?" value={place} onSelect={setPlace} />

          {add.error !== null && (
            <p role="alert" className="text-danger text-sm">
              {toApiError(add.error).message}
            </p>
          )}

          <Button type="submit" disabled={!ready || add.isPending}>
            {add.isPending ? 'Saving…' : 'Save place'}
          </Button>
        </form>
      )}
    </section>
  );
}
