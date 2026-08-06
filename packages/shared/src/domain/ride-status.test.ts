import { describe, expect, it } from '@jest/globals';

import {
  ACTIVE_RIDE_STATUSES,
  canTransition,
  DRIVER_ENGAGED_STATUSES,
  isActiveRideStatus,
  isTerminalRideStatus,
  nextStatuses,
  RIDE_TRANSITIONS,
  RideStatus,
  TERMINAL_RIDE_STATUSES,
} from './ride-status';

describe('ride state machine', () => {
  describe('canTransition — the golden path', () => {
    // Journey J1 from docs/product-spec.md, step by step.
    it.each([
      [RideStatus.REQUESTED, RideStatus.ACCEPTED],
      [RideStatus.ACCEPTED, RideStatus.ARRIVED],
      [RideStatus.ARRIVED, RideStatus.IN_PROGRESS],
      [RideStatus.IN_PROGRESS, RideStatus.COMPLETED],
    ])('allows %s -> %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe('canTransition — illegal transitions', () => {
    it('forbids resurrecting a completed ride', () => {
      expect(canTransition(RideStatus.COMPLETED, RideStatus.CANCELLED)).toBe(
        false,
      );
      expect(canTransition(RideStatus.COMPLETED, RideStatus.IN_PROGRESS)).toBe(
        false,
      );
    });

    it('forbids skipping the pickup', () => {
      expect(canTransition(RideStatus.ACCEPTED, RideStatus.COMPLETED)).toBe(
        false,
      );
      expect(canTransition(RideStatus.REQUESTED, RideStatus.IN_PROGRESS)).toBe(
        false,
      );
    });

    it('forbids cancelling once the ride is under way', () => {
      // Invariant: a started ride ends by completing, not by cancelling.
      expect(canTransition(RideStatus.IN_PROGRESS, RideStatus.CANCELLED)).toBe(
        false,
      );
    });

    it('forbids leaving any terminal state', () => {
      for (const terminal of TERMINAL_RIDE_STATUSES) {
        for (const target of Object.values(RideStatus)) {
          expect(canTransition(terminal, target)).toBe(false);
        }
      }
    });

    it('forbids self-transitions', () => {
      for (const status of Object.values(RideStatus)) {
        expect(canTransition(status, status)).toBe(false);
      }
    });
  });

  describe('table integrity', () => {
    it('defines transitions for every status', () => {
      for (const status of Object.values(RideStatus)) {
        expect(RIDE_TRANSITIONS).toHaveProperty(status);
      }
    });

    it('never targets an unknown status', () => {
      const known = new Set<string>(Object.values(RideStatus));
      for (const targets of Object.values(RIDE_TRANSITIONS)) {
        for (const target of targets) {
          expect(known.has(target)).toBe(true);
        }
      }
    });

    it('partitions statuses into exactly active and terminal', () => {
      const partitioned = [
        ...ACTIVE_RIDE_STATUSES,
        ...TERMINAL_RIDE_STATUSES,
      ].sort();
      expect(partitioned).toEqual(Object.values(RideStatus).sort());
    });

    it('makes every non-terminal status reachable from REQUESTED', () => {
      const seen = new Set<RideStatus>([RideStatus.REQUESTED]);
      const queue: RideStatus[] = [RideStatus.REQUESTED];

      while (queue.length > 0) {
        const current = queue.shift();
        // `noUncheckedIndexedAccess` makes shift() return `T | undefined`;
        // narrowing beats a `!` assertion even in tests.
        if (current === undefined) break;

        for (const next of nextStatuses(current)) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }

      expect(seen.size).toBe(Object.values(RideStatus).length);
    });
  });

  describe('status classification', () => {
    it('classifies terminal states', () => {
      expect(isTerminalRideStatus(RideStatus.COMPLETED)).toBe(true);
      expect(isTerminalRideStatus(RideStatus.CANCELLED)).toBe(true);
      expect(isTerminalRideStatus(RideStatus.EXPIRED)).toBe(true);
      expect(isTerminalRideStatus(RideStatus.ACCEPTED)).toBe(false);
    });

    it('classifies active states', () => {
      expect(isActiveRideStatus(RideStatus.REQUESTED)).toBe(true);
      expect(isActiveRideStatus(RideStatus.IN_PROGRESS)).toBe(true);
      expect(isActiveRideStatus(RideStatus.COMPLETED)).toBe(false);
    });

    it('excludes REQUESTED from driver-engaged states', () => {
      // A REQUESTED ride has no driver yet — this list is the WHERE clause
      // of the one_active_ride_per_driver partial index (ERD §3 N2).
      expect(
        (DRIVER_ENGAGED_STATUSES as readonly RideStatus[]).includes(
          RideStatus.REQUESTED,
        ),
      ).toBe(false);
      expect(DRIVER_ENGAGED_STATUSES).toHaveLength(3);
    });
  });
});
