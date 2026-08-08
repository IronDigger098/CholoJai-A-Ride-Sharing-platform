import { z } from 'zod';

import { UserRole } from '../domain/roles';

import { userSummarySchema } from './auth.contracts';

/**
 * Administrative contracts.
 *
 * Only role management for now. It is here first because it is the one
 * administrative act the platform cannot function without: nothing else can
 * grant a role, so without it the only way to create a driver or a second
 * administrator is to edit the database by hand.
 */

/**
 * A user id in a path.
 *
 * Bounded rather than matched against a CUID pattern. The length check
 * stops an absurd path segment from reaching the database; deciding whether
 * the id is *well-formed* is the database's job, and a regex here would
 * have to be revised the day the id format changes.
 */
export const userIdParamSchema = z.object({
  userId: z.string().min(1).max(64),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

export const grantRoleRequestSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export type GrantRoleRequest = z.infer<typeof grantRoleRequestSchema>;

export const revokeRoleParamsSchema = z.object({
  userId: z.string().min(1).max(64),
  role: z.nativeEnum(UserRole),
});

export type RevokeRoleParams = z.infer<typeof revokeRoleParamsSchema>;

/**
 * The affected user, after the change.
 *
 * Returning the whole user rather than an acknowledgement means the caller
 * sees the resulting role set without a follow-up request — and, more
 * usefully, sees it as the server understands it rather than as the client
 * predicted it would be.
 */
export const roleChangeResponseSchema = z.object({
  user: userSummarySchema,
});

export type RoleChangeResponse = z.infer<typeof roleChangeResponseSchema>;
