'use client';

import {
  type Coupon,
  CouponKind,
  type CreateCouponRequest,
  formatTaka,
  type Paisa,
} from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { createCoupon, listCoupons, updateCoupon } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * Discount campaigns, created and retired.
 *
 * Editing is deliberately narrow. A campaign's code, kind and value cannot
 * change once it exists — quotes already priced with it carry the old number,
 * and rewriting what a code is worth would mean the price a rider accepted
 * and the price recorded came from different rules. Retiring one and creating
 * another says the same thing without the lie.
 *
 * There is no delete. `redeemedCount` is the record of what a campaign cost,
 * and a row that can be removed is an accounting hole.
 */

const KIND_LABEL: Record<CouponKind, string> = {
  [CouponKind.PERCENT]: 'Percentage off',
  [CouponKind.FIXED]: 'Fixed amount off',
};

/** Taka in the form, paisa on the wire — money is an integer everywhere. */
const PAISA_PER_TAKA = 100;

interface DraftState {
  code: string;
  kind: CouponKind;
  value: string;
  minFareTaka: string;
  maxRedemptions: string;
  perUserLimit: string;
  firstRideOnly: boolean;
  endsAt: string;
}

const EMPTY: DraftState = {
  code: '',
  kind: CouponKind.PERCENT,
  value: '',
  minFareTaka: '',
  maxRedemptions: '',
  perUserLimit: '1',
  firstRideOnly: false,
  endsAt: '',
};

export function CampaignManager(): ReactNode {
  const queryClient = useQueryClient();
  const id = useId();

  const [draft, setDraft] = useState<DraftState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    error: queryError,
    isPending,
  } = useQuery({
    queryKey: ['admin-coupons'],
    queryFn: listCoupons,
  });

  function settle(): void {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
  }

  function fail(cause: unknown): void {
    setError(toApiError(cause).message);
  }

  const create = useMutation({
    mutationFn: createCoupon,
    onSuccess: () => {
      setDraft(EMPTY);
      settle();
    },
    onError: fail,
  });

  const amend = useMutation({
    mutationFn: updateCoupon,
    onSuccess: settle,
    onError: fail,
  });

  function onCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    /* `startsAt` is now rather than a field. A campaign an administrator is
       filling in is one they want running; a start date would mostly be a
       way to typo a launch into next year. Ending it is the scheduled act,
       so that is the one with a control. */
    create.mutate({
      code: draft.code,
      kind: draft.kind,
      value: Number(draft.value),
      minFarePaisa: takaToPaisa(draft.minFareTaka),
      perUserLimit: Number(draft.perUserLimit),
      firstRideOnly: draft.firstRideOnly,
      startsAt: new Date().toISOString(),
      ...(draft.maxRedemptions === ''
        ? {}
        : { maxRedemptions: Number(draft.maxRedemptions) }),
      ...(draft.endsAt === ''
        ? {}
        : { endsAt: new Date(draft.endsAt).toISOString() }),
    } satisfies CreateCouponRequest);
  }

  const coupons = data ?? [];

  return (
    <div className="space-y-8">
      {error !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <form onSubmit={onCreate} noValidate className="space-y-4">
        <h2 className="text-lg font-medium">New campaign</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={`${id}-code`}
            label="Code"
            hint="Letters, numbers and dashes. Riders may type it in any case."
            value={draft.code}
            onChange={(event) => {
              setDraft({ ...draft, code: event.target.value });
            }}
            required
          />

          <div className="space-y-1.5">
            <label htmlFor={`${id}-kind`} className="block text-sm font-medium">
              Discount type
            </label>
            <select
              id={`${id}-kind`}
              value={draft.kind}
              onChange={(event) => {
                setDraft({ ...draft, kind: event.target.value as CouponKind });
              }}
              className="border-border-strong bg-surface text-content h-11 w-full rounded-md border px-3 text-sm"
            >
              {Object.values(CouponKind).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </div>

          <Field
            id={`${id}-value`}
            label={
              draft.kind === CouponKind.PERCENT ? 'Percent off' : 'Paisa off'
            }
            type="number"
            min={1}
            max={draft.kind === CouponKind.PERCENT ? 100 : undefined}
            value={draft.value}
            onChange={(event) => {
              setDraft({ ...draft, value: event.target.value });
            }}
            required
          />

          <Field
            id={`${id}-min-fare`}
            label="Minimum fare (৳)"
            hint="Leave blank to apply to any journey."
            type="number"
            min={0}
            value={draft.minFareTaka}
            onChange={(event) => {
              setDraft({ ...draft, minFareTaka: event.target.value });
            }}
          />

          <Field
            id={`${id}-budget`}
            label="Total redemptions"
            hint="Leave blank for no limit."
            type="number"
            min={1}
            value={draft.maxRedemptions}
            onChange={(event) => {
              setDraft({ ...draft, maxRedemptions: event.target.value });
            }}
          />

          <Field
            id={`${id}-per-user`}
            label="Per rider"
            type="number"
            min={1}
            value={draft.perUserLimit}
            onChange={(event) => {
              setDraft({ ...draft, perUserLimit: event.target.value });
            }}
            required
          />

          <Field
            id={`${id}-ends`}
            label="Ends"
            hint="Leave blank to run until retired."
            type="datetime-local"
            value={draft.endsAt}
            onChange={(event) => {
              setDraft({ ...draft, endsAt: event.target.value });
            }}
          />

          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={draft.firstRideOnly}
              onChange={(event) => {
                setDraft({ ...draft, firstRideOnly: event.target.checked });
              }}
              className="border-border-strong size-4 rounded border"
            />
            First ride only
          </label>
        </div>

        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create campaign'}
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Campaigns</h2>

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

        {!isPending && coupons.length === 0 && (
          <p className="text-content-muted text-sm">
            No campaigns yet. The form above makes the first one.
          </p>
        )}

        <ul className="space-y-3">
          {coupons.map((coupon) => (
            <li
              key={coupon.id}
              className="border-border-strong flex flex-wrap items-baseline justify-between gap-3 rounded-md border px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block font-mono text-sm font-medium">
                  {coupon.code}
                  {coupon.isActive ? '' : ' · retired'}
                </span>
                <span className="text-content-subtle block text-xs">
                  {describe(coupon)}
                </span>
              </span>

              <span className="flex items-baseline gap-3">
                <span className="text-content-subtle text-xs">
                  {coupon.redeemedCount} used
                  {coupon.maxRedemptions === null
                    ? ''
                    : ` of ${coupon.maxRedemptions}`}
                </span>

                {/* Retiring is one-way in this screen. Re-activating a
                    campaign whose end date has passed would do nothing, and
                    a button that silently does nothing is worse than one
                    that is absent. */}
                {coupon.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={amend.isPending}
                    onClick={() => {
                      amend.mutate({
                        couponId: coupon.id,
                        changes: { isActive: false },
                      });
                    }}
                  >
                    Retire
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Blank means no minimum, which is zero rather than `NaN`. */
function takaToPaisa(taka: string): number {
  return taka === '' ? 0 : Math.round(Number(taka) * PAISA_PER_TAKA);
}

/** One line describing what a campaign does and to whom. */
function describe(coupon: Coupon): string {
  const off =
    coupon.kind === CouponKind.PERCENT
      ? `${coupon.value}% off`
      : `${formatTaka(coupon.value as Paisa)} off`;

  const parts = [off];

  if (coupon.minFarePaisa > 0) {
    parts.push(`fares over ${formatTaka(coupon.minFarePaisa as Paisa)}`);
  }

  if (coupon.firstRideOnly) parts.push('first ride only');

  parts.push(
    coupon.perUserLimit === 1
      ? 'once per rider'
      : `${coupon.perUserLimit}× per rider`,
  );

  return parts.join(' · ');
}
