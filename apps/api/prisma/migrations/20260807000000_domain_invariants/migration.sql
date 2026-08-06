-- CholoJai — domain invariants that Prisma's schema DSL cannot express.
--
-- This migration is hand-written on purpose. ADR-003 said we would drop to
-- raw SQL where Prisma's abstraction falls short and document each place;
-- this is that place. Every constraint below corresponds to a numbered
-- invariant in docs/domain-model.md §3 or a design note in
-- docs/database-erd.md §3.
--
-- These are defence in depth. Services check first so the user gets a
-- friendly message; these constraints guarantee correctness even when the
-- application loses a race it did not know it was in.

-- ─────────────────────────────────────────────────────────────────────────
-- Invariant 3 — a rider has at most one ride in a non-terminal state.
--
-- A plain UNIQUE index on rider_id is wrong: riders take many rides over a
-- lifetime. PostgreSQL's PARTIAL unique index expresses exactly what we
-- mean — uniqueness only among rows matching the predicate. Two concurrent
-- booking requests from one rider: the database rejects the second.
-- ─────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX one_active_ride_per_rider
  ON rides (rider_id)
  WHERE status IN ('REQUESTED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS');

-- ─────────────────────────────────────────────────────────────────────────
-- Invariant 2 — a driver has at most one ride they are committed to.
--
-- REQUESTED is deliberately absent: an unmatched ride has no driver yet,
-- and driver_profile_id is NULL there. The predicate must stay in step with
-- DRIVER_ENGAGED_STATUSES in packages/shared/src/domain/ride-status.ts.
-- ─────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX one_active_ride_per_driver
  ON rides (driver_profile_id)
  WHERE status IN ('ACCEPTED', 'ARRIVED', 'IN_PROGRESS');

-- ─────────────────────────────────────────────────────────────────────────
-- Note N2 — a driver has at most one active vehicle.
-- ─────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX one_active_vehicle_per_driver
  ON vehicles (driver_profile_id)
  WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────
-- Note N3 — the fare breakdown must actually add up.
--
-- The database verifies our arithmetic on every write, forever. A rounding
-- bug in the fare engine becomes a failed insert during development rather
-- than a receipt whose lines do not sum to its total, discovered by a user.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE rides
  ADD CONSTRAINT fare_total_is_consistent
  CHECK (
    fare_total_paisa
      = fare_base_paisa + fare_distance_paisa + fare_time_paisa
        - fare_discount_paisa
  );

-- Money is a count of paisa and can never be negative.
ALTER TABLE rides
  ADD CONSTRAINT fare_components_non_negative
  CHECK (
    fare_base_paisa >= 0
    AND fare_distance_paisa >= 0
    AND fare_time_paisa >= 0
    AND fare_discount_paisa >= 0
    AND fare_total_paisa >= 0
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Note N4 — a denormalised rating must stay inside its own scale.
--
-- Stored as rating × 100, so 0–500 covers 0.00–5.00 stars.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE driver_profiles
  ADD CONSTRAINT rating_average_within_scale
  CHECK (rating_avg_x100 BETWEEN 0 AND 500);

ALTER TABLE driver_profiles
  ADD CONSTRAINT rating_count_non_negative
  CHECK (rating_count >= 0);

-- A review is 1–5 stars. Enforced here rather than only in a Zod schema,
-- because a seed script or a future admin tool writes rows too.
ALTER TABLE reviews
  ADD CONSTRAINT rating_within_range
  CHECK (rating BETWEEN 1 AND 5);
