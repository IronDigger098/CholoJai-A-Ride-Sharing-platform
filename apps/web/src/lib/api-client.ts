import { loginResponseSchema } from '@cholojai/shared';
import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

import { accessToken } from './access-token';
import { toApiError } from './api-error';
import { createRefreshCoordinator } from './refresh-coordinator';

/**
 * The one HTTP client the app uses.
 *
 * Everything being a client of this API implies lives here, so no feature
 * has to remember it: the bearer header, the refresh cookie, silent
 * re-authentication on an expired token, and the conversion of every failure
 * into `ApiError`.
 */

const BASE_URL =
  process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:4000/api/v1';

/** Marks a request already retried once after a refresh. */
interface RetriableConfig extends InternalAxiosRequestConfig {
  retried?: boolean;
}

/**
 * A second client with no interceptors, used only to refresh.
 *
 * If refreshing went through `apiClient`, a 401 from the refresh endpoint
 * would trigger the refresh interceptor, which would refresh again — an
 * infinite loop that presents as a hung page rather than an error.
 * Separating them makes that impossible rather than guarded against.
 */
const refreshClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

const refreshAccessToken = createRefreshCoordinator(
  async (): Promise<string> => {
    const response = await refreshClient.post('/auth/refresh');

    /* Parsed, not cast. This response decides whether the user stays signed
       in; a shape nobody verified would put `undefined` into the
       Authorization header of every request after it. */
    const { accessToken: token } = loginResponseSchema.parse(response.data);

    accessToken.set(token);
    return token;
  },
);

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  /* Permits the refresh cookie to be sent. It is scoped to /api/v1/auth
     server-side, so the browser attaches it only to refresh and logout —
     this flag allows that, it does not put the cookie on every request. */
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = accessToken.get();

  if (token !== null) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (cause: unknown): Promise<never> => {
    const error = toApiError(cause);

    if (!axios.isAxiosError(cause)) throw error;

    const config: RetriableConfig | undefined = cause.config;

    /* Only ACCESS_TOKEN_EXPIRED. The API distinguishes it from
       INVALID_ACCESS_TOKEN precisely so a client can tell "refresh and
       retry" from "sign in again", and retrying a forged token would burn a
       refresh rotation to earn the same 401.

       `retried` stops a second attempt: if the request fails again after a
       successful refresh, refreshing once more cannot help. */
    if (
      config === undefined ||
      error.status !== 401 ||
      error.code !== 'ACCESS_TOKEN_EXPIRED' ||
      config.retried === true
    ) {
      throw error;
    }

    config.retried = true;

    try {
      await refreshAccessToken();
    } catch {
      /* The refresh itself failed — family revoked, or no cookie. Report the
         original 401: the user's problem is that they are signed out, and
         the refresh call is an implementation detail they never made. */
      accessToken.clear();
      throw error;
    }

    /* Generic, so the contextual return type resolves it — no assertion
       needed, and adding one would be a no-op the linter rejects. */
    return apiClient.request(config);
  },
);
