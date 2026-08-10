/**
 * The access token, held in memory only.
 *
 * Not `localStorage`, and not a readable cookie. Anything a script can read,
 * an injected script can read: one XSS payload on any page of this app would
 * be able to exfiltrate a token that stays valid for its full lifetime, and
 * no amount of care elsewhere would undo that. A module-scoped variable dies
 * with the tab, so the blast radius of a successful injection is the session
 * the attacker was already inside.
 *
 * The cost is that a page refresh loses the token. That is not a gap — it is
 * what the refresh cookie is for. The cookie is `httpOnly` (unreadable by
 * script), `sameSite: 'strict'` (never sent cross-site), and scoped to
 * `/api/v1/auth`, so it survives the reload, cannot be stolen by script, and
 * cannot ride along to `/rides` even if it could be.
 *
 * **Client-only.** This module holds process-wide mutable state, which on a
 * server would be shared between every user's request at once. Nothing under
 * `app/` may import it from a Server Component; the client that uses it is
 * marked `'use client'`, and this comment is the reason to keep it that way.
 */

let token: string | null = null;

export const accessToken = {
  get(): string | null {
    return token;
  },

  set(value: string): void {
    token = value;
  },

  clear(): void {
    token = null;
  },
};
