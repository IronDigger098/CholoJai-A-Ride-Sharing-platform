import { buttonClassName, type ButtonSize, type ButtonVariant } from './button';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { LocaleLink } from '@/i18n/navigation';

/**
 * A link styled as a button.
 *
 * The landing page's calls to action used to be `<Button>`s with nowhere to
 * go: they rendered, they looked pressable, and pressing them did nothing.
 * Navigation belongs to a link — it can be opened in a new tab, it shows its
 * destination, and it is announced as what it is. This is that link in the
 * button's clothes.
 *
 * Internal paths go through next-intl's `Link` so a Bangla reader stays in
 * Bangla; fragments stay plain anchors, because `/bn#fares` is a different
 * page from `#fares`.
 */
export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

export function LinkButton({
  href,
  variant = 'action',
  size = 'md',
  className = '',
  children,
  ...rest
}: LinkButtonProps): ReactNode {
  const classes =
    `${buttonClassName(variant, size)} no-underline ${className}`.trim();

  if (href.startsWith('#')) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <LocaleLink href={href} className={classes} {...rest}>
      {children}
    </LocaleLink>
  );
}
