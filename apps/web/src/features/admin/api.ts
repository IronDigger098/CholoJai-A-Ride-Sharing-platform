import {
  type DriverApplication,
  driverApplicationListSchema,
  type DriverApplicationStatus,
  type DriverProfile,
  driverProfileSchema,
  roleChangeResponseSchema,
  type UserListQuery,
  type UserPage,
  userPageSchema,
  type UserRole,
  type UserSummary,
} from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

/** Administrative calls. Every response is parsed against the shared contract. */

export async function listDriverApplications(
  status: DriverApplicationStatus,
): Promise<readonly DriverApplication[]> {
  const response = await apiClient.get('/admin/driver-applications', {
    params: { status },
  });

  return driverApplicationListSchema.parse(response.data).applications;
}

export async function approveDriverApplication(
  driverProfileId: string,
): Promise<DriverProfile> {
  const response = await apiClient.post(
    `/admin/driver-applications/${driverProfileId}/approve`,
    {},
  );

  return driverProfileSchema.parse(response.data);
}

/**
 * Rejection takes one argument because React Query mutations do.
 *
 * `mutationFn` receives a single value, so a two-parameter function would
 * force every call site to build the same closure. The object is that value.
 */
export interface RejectApplicationInput {
  readonly driverProfileId: string;
  readonly reason: string;
}

export async function rejectDriverApplication({
  driverProfileId,
  reason,
}: RejectApplicationInput): Promise<DriverProfile> {
  const response = await apiClient.post(
    `/admin/driver-applications/${driverProfileId}/reject`,
    { reason },
  );

  return driverProfileSchema.parse(response.data);
}

export async function listUsers(query: UserListQuery): Promise<UserPage> {
  const response = await apiClient.get('/admin/users', { params: query });

  return userPageSchema.parse(response.data);
}

export interface RoleChangeInput {
  readonly userId: string;
  readonly role: UserRole;
}

export async function grantRole({
  userId,
  role,
}: RoleChangeInput): Promise<UserSummary> {
  const response = await apiClient.post(`/admin/users/${userId}/roles`, {
    role,
  });

  return roleChangeResponseSchema.parse(response.data).user;
}

export async function revokeRole({
  userId,
  role,
}: RoleChangeInput): Promise<UserSummary> {
  const response = await apiClient.delete(
    `/admin/users/${userId}/roles/${role}`,
  );

  return roleChangeResponseSchema.parse(response.data).user;
}
