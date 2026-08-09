import type { HTMLAttributes, ReactNode } from 'react';

/**
 * A raised surface with a border.
 *
 * Extracted, not invented: the how-it-works steps and the fare breakdown
 * both needed the same treatment, and a third copy of
 * `rounded-xl border border-border bg-surface-raised` was the point at
 * which it earned a name.
 *
 * `as` exists because the same visual treatment belongs to different
 * elements — a list item in a step sequence, a plain container elsewhere —
 * and hard-coding `div` would force callers to nest a semantically correct
 * element inside a semantically meaningless one.
 */

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly as?: 'div' | 'li' | 'article' | 'section';
}

export function Card({
  as: Element = 'div',
  className = '',
  ...rest
}: CardProps): ReactNode {
  return (
    <Element
      className={`border-border bg-surface-raised rounded-xl border p-6 ${className}`.trim()}
      {...rest}
    />
  );
}
