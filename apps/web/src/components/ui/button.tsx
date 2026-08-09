import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

/**
 * The button primitive.
 *
 * Not a client component. It holds no state and calls no hooks, so it
 * renders on the server; a caller that passes `onClick` is itself a client
 * component and the boundary lives there. Marking this `'use client'`
 * would drag every page that renders a button into the client bundle.
 *
 * Every colour is a semantic token. A variant is a *role* — the thing to
 * press, the branded thing, the quiet thing — which is why there is no
 * `red` or `teal` variant here.
 */

export type ButtonVariant = 'action' | 'accent' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly ref?: Ref<HTMLButtonElement>;
}

/* Disabled uses its own tokens rather than `opacity-60`. Opacity fades the
   text and the background together, so a control that was legible becomes
   one that is not, and the people it fails are exactly the people who need
   it most. WCAG exempts disabled controls from contrast requirements; that
   is a licence, not a target. */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold ' +
  'transition-colors select-none ' +
  'disabled:pointer-events-none disabled:bg-surface-disabled ' +
  'disabled:text-content-disabled';

const VARIANTS: Record<ButtonVariant, string> = {
  action: 'bg-action text-action-content hover:bg-action-hover',
  accent: 'bg-accent text-accent-content hover:bg-accent-hover',
  ghost: 'border border-border-strong text-content hover:bg-surface-raised',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
};

export function Button({
  variant = 'action',
  size = 'md',
  className = '',
  type = 'button',
  ref,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      /* `type` defaults to "button", not "submit". HTML's default is
         "submit", so a button placed in a form to do something unrelated
         silently submits it — a bug that only shows up once the button is
         reused inside a form, long after it was written. Callers that
         want submission ask for it. */
      type={type}
      ref={ref}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()}
      {...rest}
    />
  );
}
