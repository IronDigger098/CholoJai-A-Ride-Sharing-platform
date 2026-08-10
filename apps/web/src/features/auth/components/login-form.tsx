'use client';

import { loginRequestSchema } from '@cholojai/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { useSession } from '../session';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * Sign in.
 *
 * Validated client-side against the *same* Zod schema the API validates
 * against (ADR-005). The client check exists to answer instantly, not to be
 * trusted — the server runs the identical schema, and the two cannot drift
 * because there is only one of them.
 */
export function LoginForm(): ReactNode {
  const { signIn } = useSession();
  const router = useRouter();
  const id = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = loginRequestSchema.safeParse({ email, password });

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
      await signIn(parsed.data.email, parsed.data.password);
      router.push('/');
    } catch (cause) {
      const error = toApiError(cause);

      /* Field-level messages go beside their input; anything else is a
         banner. A 401 here is deliberately not attached to either field —
         the API does not say which was wrong, because telling an attacker
         "the password was the problem" confirms the address exists. */
      const fieldErrors = Object.fromEntries(
        error.fieldErrors.map((field) => [field.path, field.message]),
      );

      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate
      className="space-y-5"
    >
      {/* `noValidate` turns off the browser's own bubbles so validation is
          announced once, by us, in a way a screen reader reaches. */}
      {formError !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      )}

      <Field
        id={`${id}-email`}
        label="Email address"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
        {...(errors['email'] === undefined ? {} : { error: errors['email'] })}
      />

      <Field
        id={`${id}-password`}
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        {...(errors['password'] === undefined
          ? {}
          : { error: errors['password'] })}
      />

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
