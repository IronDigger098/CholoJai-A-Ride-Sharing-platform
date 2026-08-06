/**
 * Ride lifecycle — the executable form of `docs/domain-model.md` §3.
 *
 * This module is the single source of truth for which ride states exist and
 * which transitions between them are legal. The API enforces it; the web app
 * derives its UI from it. Neither may hard-code a status string.
 */

/**
 * Why a const object and a union type instead of a TypeScript `enum`:
 * `enum` emits a runtime object that cannot be tree-shaken, has surprising
 * numeric-reverse-mapping behaviour, and is disallowed under
 * `isolatedModules` in some toolchains. This pattern gives the same
 * ergonomics with plain, erasable types.
 */
export const RideStatus = {
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type RideStatus = (typeof RideStatus)[keyof typeof RideStatus];

export const CancelledBy = {
  RIDER: 'RIDER',
  DRIVER: 'DRIVER',
  SYSTEM: 'SYSTEM',
} as const;

export type CancelledBy = (typeof CancelledBy)[keyof typeof CancelledBy];

/**
 * The complete transition table. Every arrow in the state diagram appears
 * here exactly once; anything absent is illegal by construction.
 *
 * `readonly` + `satisfies` means adding a status to `RideStatus` without
 * adding its transitions is a compile error — the table cannot silently
 * fall out of date.
 */
export const RIDE_TRANSITIONS = {
  REQUESTED: ['ACCEPTED', 'CANCELLED', 'EXPIRED'],
  ACCEPTED: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
} as const satisfies Readonly<Record<RideStatus, readonly RideStatus[]>>;

/** States in which a ride is still running. */
export const ACTIVE_RIDE_STATUSES = [
  RideStatus.REQUESTED,
  RideStatus.ACCEPTED,
  RideStatus.ARRIVED,
  RideStatus.IN_PROGRESS,
] as const;

/** States a ride can never leave. */
export const TERMINAL_RIDE_STATUSES = [
  RideStatus.COMPLETED,
  RideStatus.CANCELLED,
  RideStatus.EXPIRED,
] as const;

/**
 * States in which a driver is committed to a ride.
 *
 * Note this excludes REQUESTED — an unmatched ride has no driver yet. This
 * list is the `WHERE` clause of the `one_active_ride_per_driver` partial
 * unique index (`docs/database-erd.md` §3 N2); the two must agree.
 */
export const DRIVER_ENGAGED_STATUSES = [
  RideStatus.ACCEPTED,
  RideStatus.ARRIVED,
  RideStatus.IN_PROGRESS,
] as const;

export function isTerminalRideStatus(status: RideStatus): boolean {
  return (TERMINAL_RIDE_STATUSES as readonly RideStatus[]).includes(status);
}

export function isActiveRideStatus(status: RideStatus): boolean {
  return (ACTIVE_RIDE_STATUSES as readonly RideStatus[]).includes(status);
}

/**
 * Is this transition allowed by the state machine?
 *
 * Pure and dependency-free so it can run in the browser (to disable a
 * button) and on the server (to reject a request) from the same definition.
 */
export function canTransition(from: RideStatus, to: RideStatus): boolean {
  const allowed: readonly RideStatus[] = RIDE_TRANSITIONS[from];
  return allowed.includes(to);
}

/** Legal next states from `from`, for UI affordances and tests. */
export function nextStatuses(from: RideStatus): readonly RideStatus[] {
  return RIDE_TRANSITIONS[from];
}
