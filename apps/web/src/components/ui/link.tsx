import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { LocaleLink } from '@/i18n/navigation';

/**
 * A link.
 *
 * Once a plain anchor throughout, on the reasoning that every link was
 * either a fragment or an external URL and `next/link` added nothing. That
 * stopped being true twice over: there are real routes now, and since M10b
 * there are two languages, so an internal href has to carry a locale
 * prefix. Internal links therefore go through next-intl's `Link` and the
 * other two cases stay anchors — a change to this file and to nothing that
 * uses it, which is what the primitive was for.
 *
 * The reason it exists at all is the external case. An `<a target="_blank">`
 * without `rel="noopener"` hands the opened page a `window.opener`
 * reference back to this one, which it can use to navigate us somewhere
 * else — a phishing vector that is invisible in review because the markup
 * looks perfectly ordinary. It is also the kind of thing every author has
 * to remember individually. Here it is automatic, along with the
 * screen-reader hint that the link leaves the site.
 */

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string;
  /** Opens in a new tab, with the safety attributes that implies. */
  readonly external?: boolean;
}

const BASE =
  'text-accent rounded-xs underline-offset-4 transition-colors hover:underline';

export function Link({
  href,
  external = false,
  className = '',
  children,
  ...rest
}: LinkProps): ReactNode {
  /* `noopener` closes the window.opener hole. `noreferrer` also withholds
     the referrer — most browsers imply it from noopener, not all do, and
     being explicit costs nothing. */
  const externalProps = external
    ? ({ target: '_blank', rel: 'noopener noreferrer' } as const)
    : {};

  /*
   * Internal links go through next-intl's Link, which prefixes the locale.
   * External ones and bare fragments stay plain anchors: prefixing
   * `https://github.com/...` or `#how-it-works` with `/bn` would produce an
   * address that does not exist.
   *
   * This is why the primitive is worth having. The rule is one condition in
   * one file rather than a judgement every author makes at every call site
   * — and the version of this bug where somebody links `/rides` directly is
   * invisible in review, because the markup looks perfectly ordinary and
   * only misbehaves for readers in the other language.
   */
  const Anchor = external || href.startsWith('#') ? 'a' : LocaleLink;

  return (
    <Anchor
      href={href}
      className={`${BASE} ${className}`.trim()}
      {...externalProps}
      {...rest}
    >
      {children}
      {external ? (
        /* Announced, not drawn. Sighted users see the new tab open; screen
           reader users otherwise get no warning that focus is about to
           leave the site entirely. */
        <span className="sr-only"> (opens in a new tab)</span>
      ) : null}
    </Anchor>
  );
}
