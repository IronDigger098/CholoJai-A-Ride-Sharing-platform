'use client';

import { registerRequestSchema } from '@cholojai/shared';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { register } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * Create an account.
 *
 * Succeeding here does not sign anyone in: the API returns a user and no
 * token, because the email is unverified. The form says so rather than
 * redirecting to a page that would immediately bounce them back.
 */
export function RegisterForm(): ReactNode {
  const id = useId();

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  function update(field: keyof typeof values, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = registerRequestSchema.safeParse(values);

    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ]),
        ),
      );
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await register(parsed.data);
      setRegistered(true);
    } catch (cause) {
      const error = toApiError(cause);
      const fieldErrors = Object.fromEntries(
        error.fieldErrors.map((field) => [field.path, field.message]),
      );

      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (registered) {
    return (
      <p role="status" className="text-sm">
        Check your inbox — we have sent a link to{' '}
        <strong>{values.email}</strong>. Verify your address, then sign in.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate
      className="space-y-5"
    >
      {formError !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      )}

      <Field
        id={`${id}-name`}
        label="Full name"
        autoComplete="name"
        value={values.fullName}
        onChange={(event) => {
          update('fullName', event.target.value);
        }}
        {...(errors['fullName'] === undefined
          ? {}
          : { error: errors['fullName'] })}
      />

      <Field
        id={`${id}-email`}
        label="Email address"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={(event) => {
          update('email', event.target.value);
        }}
        {...(errors['email'] === undefined ? {} : { error: errors['email'] })}
      />

      <Field
        id={`${id}-password`}
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters."
        value={values.password}
        onChange={(event) => {
          update('password', event.target.value);
        }}
        {...(errors['password'] === undefined
          ? {}
          : { error: errors['password'] })}
      />

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
