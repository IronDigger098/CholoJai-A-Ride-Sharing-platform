import { Injectable } from '@nestjs/common';
import { type Request, type Response } from 'express';

import { AppConfigService } from '../../config/app-config.service';

/**
 * The cookie name.
 *
 * No `__Host-` or `__Secure-` prefix: `__Host-` forbids a `Path` attribute
 * other than `/`, and scoping this cookie to `/api/v1/auth` is worth more
 * here than the prefix's protection against a sibling subdomain setting it
 * (see `AppConfigService.refreshCookie`).
 */
export const REFRESH_COOKIE_NAME = 'cholojai_rt';

/**
 * The one place that knows the refresh token travels in a cookie.
 *
 * Both the name and the attributes live here because *clearing* a cookie
 * is the part that goes wrong: a browser only removes a cookie when the
 * `Set-Cookie` that deletes it carries the same `Domain` and `Path` as the
 * one that created it. Written out twice at two call sites, those drift,
 * and the symptom is a sign-out that appears to work and leaves a live
 * session cookie in the browser. Deriving both from one config object
 * makes that impossible.
 *
 * Keeping it out of `AuthService` also keeps that service free of HTTP:
 * it deals in tokens, and only the controller layer knows they are carried
 * by cookies.
 */
@Injectable()
export class RefreshCookieService {
  public constructor(private readonly config: AppConfigService) {}

  public set(response: Response, plaintextToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, plaintextToken, {
      ...this.config.refreshCookie,
    });
  }

  /**
   * Remove the cookie.
   *
   * `maxAge` is dropped and the attributes are otherwise identical — an
   * expiry in the past is what deletes it, and passing the original
   * `maxAge` alongside would contradict that.
   */
  public clear(response: Response): void {
    const { maxAge: _maxAge, ...attributes } = this.config.refreshCookie;

    response.clearCookie(REFRESH_COOKIE_NAME, attributes);
  }

  /**
   * Read the cookie off a request.
   *
   * `request.cookies` is populated by `cookie-parser` and typed as `any` by
   * its type definitions, so every value out of it is narrowed explicitly
   * rather than trusted. An attacker controls this string entirely; the
   * type system must not be told otherwise.
   */
  public read(request: Request): string | null {
    const jar: unknown = request.cookies;

    if (typeof jar !== 'object' || jar === null) return null;

    const value = (jar as Record<string, unknown>)[REFRESH_COOKIE_NAME];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
