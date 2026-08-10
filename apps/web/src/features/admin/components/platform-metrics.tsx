'use client';

import { formatTaka, type Paisa, type RidesOnDay } from '@cholojai/shared';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useId, useState } from 'react';

import { getPlatformMetrics } from '../api';

import { Button } from '@/components/ui/button';
import { toApiError } from '@/lib/api-error';

/**
 * The platform at a glance.
 *
 * Drawn with two divs per day rather than a charting library. Fourteen bars
 * do not justify pulling a rendering engine into the bundle of an app whose
 * riders will never see this page, and a `<table>` carries the numbers for
 * anyone the bars do not reach.
 */

const WINDOWS = [7, 14, 30] as const;

export function PlatformMetrics(): ReactNode {
  const id = useId();
  const [days, setDays] = useState<number>(14);

  const { data, error, isPending } = useQuery({
    queryKey: ['platform-metrics', days],
    queryFn: () => getPlatformMetrics(days),
  });

  if (isPending) {
    return (
      <p role="status" className="text-content-muted text-sm">
        Loading…
      </p>
    );
  }

  if (error !== null) {
    return (
      <p role="alert" className="text-danger text-sm">
        {toApiError(error).message}
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby={`${id}-now-heading`}>
        <h2 id={`${id}-now-heading`} className="mb-4 text-sm font-medium">
          Right now
        </h2>

        <dl className="grid grid-cols-2 gap-4">
          <Figure label="Rides in progress" value={data.now.ridesInProgress} />
          <Figure
            label="Applications waiting"
            value={data.now.applicationsPending}
          />
        </dl>
      </section>

      <section aria-labelledby={`${id}-totals-heading`}>
        <h2 id={`${id}-totals-heading`} className="mb-4 text-sm font-medium">
          All time
        </h2>

        <dl className="grid grid-cols-2 gap-4">
          <Figure label="Users" value={data.totals.users} />
          <Figure label="Approved drivers" value={data.totals.drivers} />
          <Figure label="Rides completed" value={data.totals.ridesCompleted} />
          <Figure
            label="Gross revenue"
            /* The sum of the fare snapshots, so a past month never moves
               when pricing changes. */
            value={formatTaka(data.totals.grossRevenuePaisa as Paisa)}
          />
        </dl>
      </section>

      <section aria-labelledby={`${id}-series-heading`} className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id={`${id}-series-heading`} className="text-sm font-medium">
            Finished rides
          </h2>

          <span className="flex gap-2">
            {/* `option`, not `window` — shadowing the global inside a
                client component is a trap for whoever edits this next. */}
            {WINDOWS.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={option === days ? 'action' : 'ghost'}
                aria-pressed={option === days}
                onClick={() => {
                  setDays(option);
                }}
              >
                {option} days
              </Button>
            ))}
          </span>
        </div>

        <RideChart days={data.ridesPerDay} />
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
}: {
  label: string;
  value: number | string;
}): ReactNode {
  return (
    <div className="border-border-strong rounded-md border px-4 py-3">
      <dt className="text-content-subtle text-xs">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The bars are decoration; the table is the data.
 *
 * `aria-hidden` on the chart and a visually hidden table beside it, rather
 * than an `aria-label` summarising the shape. A summary is the author's
 * reading of the chart — the table is the chart, and a screen-reader user
 * gets to do their own reading.
 */
function RideChart({ days }: { days: readonly RidesOnDay[] }): ReactNode {
  const busiest = Math.max(
    1,
    ...days.map((day) => day.completed + day.cancelled),
  );

  return (
    <>
      <div
        aria-hidden="true"
        className="border-border flex h-40 items-end gap-1 border-b pb-px"
      >
        {days.map((day) => (
          <span
            key={day.date}
            className="flex h-full flex-1 flex-col justify-end"
          >
            {/* Inline heights: the value is a percentage computed at
                render, and Tailwind only ships classes it can find as
                literal strings in the source. */}
            <span
              className="bg-surface-disabled block w-full"
              style={{ height: `${String((day.cancelled / busiest) * 100)}%` }}
            />
            <span
              className="bg-action block w-full rounded-t-sm"
              style={{ height: `${String((day.completed / busiest) * 100)}%` }}
            />
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Finished rides per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Completed</th>
            <th scope="col">Cancelled</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{day.completed}</td>
              <td>{day.cancelled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
