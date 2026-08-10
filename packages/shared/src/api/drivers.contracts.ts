import { z } from 'zod';

import { DriverApplicationStatus } from '../domain/roles';

/**
 * Driver contracts — `docs/api-design.md` §Drivers.
 */

/**
 * Applying to drive.
 *
 * The licence number is sent once and never stored in full: the server keeps
 * only a masked form (`driver_profiles.license_no_masked`). A real platform
 * verifies the number against an authority and retains it under a retention
 * policy; this one has neither, so holding the full number would be
 * collecting an identity document for no purpose it can serve — the worst
 * kind of data to hold, because a breach costs the driver and the platform
 * gains nothing from it.
 */
export const driverApplicationRequestSchema = z.object({
  licenseNo: z
    .string()
    .trim()
    .min(6, 'Enter your full driving licence number')
    .max(32),
});

export type DriverApplicationRequest = z.infer<
  typeof driverApplicationRequestSchema
>;

/**
 * A driver's own profile.
 *
 * `ratingAvgX100` travels as the stored integer rather than a decimal, for
 * the same reason money does: 4.87 is exactly 487, and no rounding happens
 * between the database and the screen.
 */
export const driverProfileSchema = z.object({
  id: z.string(),
  applicationStatus: z.nativeEnum(DriverApplicationStatus),
  rejectionReason: z.string().nullable(),
  licenseNoMasked: z.string().nullable(),
  isAvailable: z.boolean(),
  ratingAvgX100: z.number().int(),
  ratingCount: z.number().int(),
  approvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type DriverProfile = z.infer<typeof driverProfileSchema>;

/** An application as an administrator reviews it. */
export const driverApplicationSchema = driverProfileSchema.extend({
  userId: z.string(),
  fullName: z.string(),
  email: z.string(),
});

export type DriverApplication = z.infer<typeof driverApplicationSchema>;

export const driverApplicationListQuerySchema = z.object({
  status: z.nativeEnum(DriverApplicationStatus).default('PENDING'),
});

export type DriverApplicationListQuery = z.infer<
  typeof driverApplicationListQuerySchema
>;

export const driverApplicationListSchema = z.object({
  applications: z.array(driverApplicationSchema),
});

export type DriverApplicationList = z.infer<typeof driverApplicationListSchema>;

export const driverProfileIdParamSchema = z.object({
  driverProfileId: z.string().min(1).max(64),
});

export type DriverProfileIdParam = z.infer<typeof driverProfileIdParamSchema>;

/**
 * Rejecting requires a reason.
 *
 * Not optional. A rejection with no explanation is one the applicant cannot
 * act on and the platform cannot defend, and "required" is the only way to
 * make that reliably true.
 */
export const rejectDriverApplicationSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export type RejectDriverApplication = z.infer<
  typeof rejectDriverApplicationSchema
>;
