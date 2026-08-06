import { randomUUID } from 'node:crypto';

/**
 * Correlation identifier plumbing.
 *
 * Every request carries an ID that appears in each log line it produces, in
 * the `X-Request-Id` response header, and in the body of any error it
 * returns (docs/api-design.md §3). A user reporting "it failed and said
 * 3f2a…" hands you the exact key to grep.
 */

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Accept a client-supplied ID only if it looks like one.
 *
 * The header is echoed back in the response, so an unchecked value is a
 * header-injection and log-forging vector: a caller could send newlines to
 * fabricate log entries, or megabytes to bloat storage. Anything that
 * fails this test is silently replaced with a fresh ID rather than
 * rejected — correlation is a convenience, not a contract, and failing a
 * request over a malformed optional header would be hostile.
 *
 * Client IDs are honoured because they let the web app, the API, and (later)
 * background jobs share one ID across a whole user action.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,128}$/;

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value);
}

/**
 * Reuse the caller's ID when it is well-formed, otherwise mint a new one.
 *
 * `randomUUID` is cryptographically random and built into Node — no
 * dependency, and non-guessable, so an ID cannot be used to infer request
 * volume the way a counter would.
 */
export function resolveRequestId(headerValue: unknown): string {
  return isSafeRequestId(headerValue) ? headerValue : randomUUID();
}
