import { z } from 'zod';

import { UserRole } from '../domain/roles';

import { userSummarySchema } from './auth.contracts';
import { cursorPageQuerySchema, pageInfoSchema } from './pagination.contracts';

/**
 * Administrative contracts.
 *
 * Role management came first because it is the one administrative act the
 * platform cannot function without: nothing else can grant a role, so
 * without it the only way to create a driver or a second administrator is to
 * edit the database by hand. The directory arrives second, because granting
 * a role to a user you have no way to find is a mechanism without a handle.
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

/**
 * Searching the user directory.
 *
 * One free-text `q` matched against name and email rather than two separate
 * parameters. An administrator looking someone up has a fragment of
 * something — half a name, a domain — and rarely knows which field it came
 * from; asking them to choose is asking them to guess.
 *
 * `role` narrows rather than searches, which is a different act: "show me
 * the drivers" is a filter over the whole directory, not a term to match.
 */
export const userListQuerySchema = cursorPageQuerySchema.extend({
  q: z.string().trim().min(1).max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

/**
 * A page of users.
 *
 * `userSummarySchema` is reused rather than given an administrative variant.
 * There is nothing an administrator may see about an account that its owner
 * may not, and a second shape would be a second thing to keep in step — the
 * day a field is added, one of them would not get it.
 */
export const userPageSchema = z.object({
  data: z.array(userSummarySchema),
  pageInfo: pageInfoSchema,
});

export type UserPage = z.infer<typeof userPageSchema>;
