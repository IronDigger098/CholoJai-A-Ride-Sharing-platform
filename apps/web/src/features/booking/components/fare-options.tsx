'use client';

import {
  type FareQuoteResponse,
  formatTaka,
  type Paisa,
  type VehicleType,
} from '@cholojai/shared';

import type { ReactNode } from 'react';

/**
 * The priced options for one journey.
 *
 * Rendered with decimals. `formatTaka` rounds to whole taka by default,
 * which is right for one headline price and wrong for a column of them —
 * three individually correct lines that visibly do not sum to their total.
 * The same reasoning as the landing page's fare section.
 */
const EXACT = { withDecimals: true } as const;

export interface FareOptionsProps {
  readonly quote: FareQuoteResponse;
  readonly selected: VehicleType | null;
  readonly onSelect: (vehicleType: VehicleType) => void;
}

export function FareOptions({
  quote,
  selected,
  onSelect,
}: FareOptionsProps): ReactNode {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Choose a vehicle</legend>

      {quote.options.map((option) => {
        const isSelected = selected === option.vehicleType;

        return (
          <label
            key={option.vehicleType}
            className={`flex cursor-pointer items-center justify-between rounded-md border px-4 py-3 ${
              isSelected
                ? 'border-accent bg-surface-raised'
                : 'border-border-strong'
            }`}
          >
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="vehicleType"
                value={option.vehicleType}
                checked={isSelected}
                onChange={() => {
                  onSelect(option.vehicleType);
                }}
                className="accent-accent"
              />
              <span className="text-sm font-medium">{option.vehicleType}</span>
            </span>

            <span className="text-sm font-semibold tabular-nums">
              {formatTaka(option.breakdown.total as Paisa, EXACT)}
            </span>
          </label>
        );
      })}

      <p className="text-content-subtle pt-1 text-xs">
        {(quote.distanceMetres / 1000).toFixed(1)} km ·{' '}
        {Math.round(quote.durationSeconds / 60)} min · price held until{' '}
        {new Date(quote.expiresAt).toLocaleTimeString()}
      </p>
    </fieldset>
  );
}
