import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

/**
 * A labelled text input with its error message.
 *
 * Not a client component, and `id` is required rather than generated with
 * `useId` for exactly that reason: calling a hook here would mark the file
 * `'use client'` and pull every page containing a form field into the client
 * bundle. Forms are client components already, so generating one id there
 * costs the caller a line and costs the app nothing.
 *
 * The accessibility wiring is the point of the component. A label bound by
 * `htmlFor`, `aria-invalid` when rejected, and `aria-describedby` pointing at
 * the message — without which a screen reader announces the field and then
 * silently omits the reason it was refused, leaving the user to guess what a
 * red border means.
 */

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly id: string;
  readonly label: string;
  /** Server- or client-side validation message. Presence marks the field invalid. */
  readonly error?: string;
  /** Persistent guidance, e.g. a password rule. Announced with the field. */
  readonly hint?: string;
  readonly ref?: Ref<HTMLInputElement>;
}

const INPUT =
  'w-full rounded-md border bg-surface px-3 h-11 text-sm text-content ' +
  'placeholder:text-content-subtle transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-accent ' +
  'disabled:bg-surface-disabled disabled:text-content-disabled';

export function Field({
  id,
  label,
  error,
  hint,
  className = '',
  ref,
  ...rest
}: FieldProps): ReactNode {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  /* Both are listed when both exist. A field can be described by more than
     one element, and dropping the hint the moment an error appears removes
     the rule the user needs in order to fix it. */
  const describedBy =
    [hint === undefined ? null : hintId, error === undefined ? null : errorId]
      .filter((value) => value !== null)
      .join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>

      {hint !== undefined && (
        <p id={hintId} className="text-content-subtle text-xs">
          {hint}
        </p>
      )}

      <input
        id={id}
        ref={ref}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy}
        className={`${INPUT} ${
          error === undefined ? 'border-border-strong' : 'border-danger'
        } ${className}`.trim()}
        {...rest}
      />

      {/* `role="alert"` so a message that appears after submission is
          announced. Without it a screen reader user submits, hears nothing,
          and has no way to know the form was rejected. */}
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
