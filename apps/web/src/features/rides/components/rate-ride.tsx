'use client';

import { RATING_MAX, RATING_MIN } from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { getMyReview, submitReview } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * Rating a finished ride.
 *
 * Radio buttons under the stars, not buttons. A rating is one choice from
 * five — which is what a radio group is — and getting that right means
 * arrow keys work, the group announces itself as "1 of 5", and the form
 * submits the way every other form does. Stars drawn with `<button>` look
 * identical and none of that is true of them.
 */

const RATINGS = Array.from(
  { length: RATING_MAX - RATING_MIN + 1 },
  (_unused, offset) => RATING_MIN + offset,
);

export function RateRide({ rideId }: { rideId: string }): ReactNode {
  const queryClient = useQueryClient();
  const id = useId();

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: existing, isPending } = useQuery({
    queryKey: ['review', rideId],
    queryFn: () => getMyReview(rideId),
  });

  const submit = useMutation({
    mutationFn: submitReview,
    onSuccess: (review) => {
      setError(null);
      queryClient.setQueryData(['review', rideId], review);
    },
    onError: (cause: unknown) => {
      setError(toApiError(cause).message);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (rating === null) {
      setError('Choose a rating first.');
      return;
    }

    submit.mutate({ rideId, rating, comment: comment.trim() });
  }

  if (isPending) return null;

  /* Already rated. Shown rather than hidden, and with no way to change it:
     the API refuses a second rating, so an edit control here could only
     ever produce an error message. */
  if (existing !== null && existing !== undefined) {
    return (
      <section aria-labelledby={`${id}-heading`} className="space-y-2">
        <h2 id={`${id}-heading`} className="text-sm font-medium">
          Your rating
        </h2>

        <p className="text-sm">
          <span aria-hidden="true">{stars(existing.rating)}</span>
          <span className="sr-only">
            {existing.rating} out of {RATING_MAX}
          </span>
        </p>

        {existing.comment !== null && (
          <p className="text-content-muted text-sm">{existing.comment}</p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4">
      <h2 id={`${id}-heading`} className="text-sm font-medium">
        How was your ride?
      </h2>

      {error !== null && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <fieldset>
          <legend className="sr-only">Rating</legend>

          <div className="flex gap-1">
            {RATINGS.map((value) => (
              <label
                key={value}
                className="cursor-pointer text-2xl leading-none"
              >
                {/* The input carries the semantics and the keyboard
                    behaviour; the star is decoration over the top of it. */}
                {/* `aria-label` on the input rather than visually hidden
                    text in the label. A wrapper label's accessible name is
                    its whole text content, and the star is text — so a
                    hidden "5 stars" beside it announces as "★ 5 stars". */}
                <input
                  type="radio"
                  name={`${id}-rating`}
                  value={value}
                  checked={rating === value}
                  aria-label={value === 1 ? '1 star' : `${String(value)} stars`}
                  onChange={() => {
                    setRating(value);
                    setError(null);
                  }}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={
                    rating !== null && value <= rating
                      ? 'text-accent'
                      : 'text-content-subtle'
                  }
                >
                  ★
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          id={`${id}-comment`}
          label="Anything to add?"
          hint="Optional."
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
          }}
        />

        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? 'Sending…' : 'Submit rating'}
        </Button>
      </form>
    </section>
  );
}

function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(RATING_MAX - rating);
}
