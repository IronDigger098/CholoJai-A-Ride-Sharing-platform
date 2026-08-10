import {
  type LoginRequest,
  type LoginResponse,
  loginResponseSchema,
  type RegisterRequest,
  type RegisterResponse,
  registerResponseSchema,
} from '@cholojai/shared';

import { accessToken } from '@/lib/access-token';
import { apiClient } from '@/lib/api-client';

/**
 * Auth calls, typed against the shared contracts.
 *
 * Every response is parsed rather than cast. These are the calls that decide
 * who the user is and what token signs their subsequent requests, so a shape
 * nobody checked is the one place a `undefined` is most expensive.
 */

export async function login(request: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post('/auth/login', request);
  const session = loginResponseSchema.parse(response.data);

  accessToken.set(session.accessToken);
  return session;
}

/**
 * Register does not sign the user in.
 *
 * The API returns the created user and nothing else — no token — because
 * the email is unverified at that point. Treating registration as a sign-in
 * would mean deciding here that an unverified address is good enough, which
 * is a policy decision the server already made the other way.
 */
export async function register(
  request: RegisterRequest,
): Promise<RegisterResponse> {
  const response = await apiClient.post('/auth/register', request);
  return registerResponseSchema.parse(response.data);
}

/**
 * Restore a session from the refresh cookie.
 *
 * Called once on mount. The access token lives in memory, so a reload always
 * starts signed out until this succeeds — that is the cost of not putting a
 * token where a script can read it, and this is what pays it.
 */
export async function restoreSession(): Promise<LoginResponse> {
  const response = await apiClient.post('/auth/refresh');
  const session = loginResponseSchema.parse(response.data);

  accessToken.set(session.accessToken);
  return session;
}

/**
 * Sign out, and clear the local token whatever the server says.
 *
 * If the request fails the user still expects to be signed out on this
 * device. Leaving a valid token in memory because a network call failed
 * would be the one outcome nobody asked for.
 */
export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } finally {
    accessToken.clear();
  }
}
