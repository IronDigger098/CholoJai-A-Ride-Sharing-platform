'use client';

import { resetPasswordRequestSchema } from '@cholojai/shared';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { resetPassword } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Link } from '@/components/ui/link';
import { toApiError } from '@/lib/api-error';

/**
 * Choose a new password, from the link in the reset email.
 *
 * Validated against the same `passwordSchema` the API enforces, so the rule
 * a person is told is the rule that is applied.
 */
export function ResetPasswordForm(): ReactNode {
  const token = useSearchParams().get('token');
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (token === null) {
    return (
      <p role="alert" className="text-danger text-sm">
        This link is missing its token.{' '}
        <Link href="/forgot-password">Ask for a new one.</Link>
      </p>
    );
  }

  const resetToken = token;

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = resetPasswordRequestSchema.safeParse({
      token: resetToken,
      password,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === 'token') setFormError(issue.message);
      else setError(issue?.message ?? 'Choose a password');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await resetPassword(parsed.data);
      setDone(true);
    } catch (cause) {
      setFormError(toApiError(cause).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="text-sm">
        Your password has been changed and every other session signed out.{' '}
        <Link href="/login">Sign in with the new one.</Link>
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
          {formError} <Link href="/forgot-password">Ask for a new link.</Link>
        </p>
      )}

      <Field
        id={`${id}-password`}
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters."
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        {...(error === null ? {} : { error })}
      />

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  );
}
