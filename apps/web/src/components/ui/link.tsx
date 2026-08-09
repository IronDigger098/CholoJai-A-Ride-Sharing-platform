import type { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * A link.
 *
 * A plain anchor today, and deliberately not a `next/link` wrapper. Every
 * link that currently exists is either an in-page fragment or an external
 * URL, and `next/link` adds nothing to either — while `typedRoutes` would
 * reject a fragment-only href outright. It becomes a `next/link` wrapper
 * the moment there is a second route to navigate to, which is a change to
 * this file and to nothing that uses it. That is the point of a primitive.
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

  return (
    <a
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
    </a>
  );
}
