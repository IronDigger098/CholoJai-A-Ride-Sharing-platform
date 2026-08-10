/**
 * Collapse concurrent refreshes into one.
 *
 * A dashboard mounts and fires four queries at once. The access token has
 * expired, so all four come back 401 within milliseconds of each other, and
 * without this every one of them starts its own refresh.
 *
 * That is not merely wasteful — it is incorrect, because refresh tokens
 * rotate. Each refresh retires the token it used and issues a successor, so
 * four concurrent refreshes send the same cookie four times. The first wins;
 * the rest are replays of a retired token. `REFRESH_ROTATION_GRACE_SECONDS`
 * exists to forgive exactly this, but leaning on a grace window to cover a
 * stampede we could simply not create is the wrong way round — and with the
 * grace set to 0, the strict mode the API supports, a replay revokes the
 * whole family and signs the user out for opening a page.
 *
 * So: one in-flight refresh, shared by every caller waiting on it.
 *
 * Deliberately not caching the *result*. The promise is cleared as soon as
 * it settles, so the next expiry starts a fresh attempt rather than handing
 * out a token that has since expired too.
 */
export function createRefreshCoordinator(
  refresh: () => Promise<string>,
): () => Promise<string> {
  let inFlight: Promise<string> | null = null;

  return (): Promise<string> => {
    inFlight ??= refresh().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}
