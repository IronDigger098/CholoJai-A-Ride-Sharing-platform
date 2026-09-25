'use client';

import {
  CouponKind,
  type FareQuoteResponse,
  formatTaka,
  type Paisa,
  type VehicleType,
} from '@cholojai/shared';
import { useFormatter, useTranslations } from 'next-intl';

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
  const t = useTranslations('booking');
  const vehicle = useTranslations('vehicle');
  const format = useFormatter();

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{t('chooseVehicle')}</legend>

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
              <span className="text-sm font-medium">
                {vehicle(option.vehicleType)}
              </span>
            </span>

            <span className="text-sm font-semibold tabular-nums">
              {formatTaka(option.breakdown.total as Paisa, EXACT)}
            </span>
          </label>
        );
      })}

      {/* Named rather than left as a number that is simply lower than
          expected. The amount is already inside each option's total; this
          says which offer moved it, and that the rider's code was used. */}
      {quote.appliedCoupon !== null && (
        <p className="text-accent pt-1 text-xs font-medium">
          {t('couponApplied', {
            code: quote.appliedCoupon.code,
            discount:
              quote.appliedCoupon.kind === CouponKind.PERCENT
                ? t('percentOff', { value: quote.appliedCoupon.value })
                : t('amountOff', {
                    amount: formatTaka(quote.appliedCoupon.value as Paisa),
                  }),
          })}
        </p>
      )}

      <p className="text-content-subtle pt-1 text-xs">
        {t('summary', {
          distance: (quote.distanceMetres / 1000).toFixed(1),
          minutes: Math.round(quote.durationSeconds / 60),
          /* The formatter, not `toLocaleTimeString`: that uses the
             browser's locale and zone, not the page's language or Dhaka. */
          time: format.dateTime(new Date(quote.expiresAt), {
            hour: 'numeric',
            minute: '2-digit',
          }),
        })}
      </p>
    </fieldset>
  );
}
