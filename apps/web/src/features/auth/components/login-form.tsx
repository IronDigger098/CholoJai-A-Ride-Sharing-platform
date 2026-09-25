'use client';

import { loginRequestSchema } from '@cholojai/shared';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { useSession } from '../session';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useRouter } from '@/i18n/navigation';
import { toApiError } from '@/lib/api-error';

/**
 * Where to go after signing in.
 *
 * `next` is set by `RequireSession` to the page that sent the visitor here.
 * Only a same-site path is honoured: an unchecked redirect parameter turns
 * the sign-in page into a trampoline to any site an attacker links to, with
 * our domain in the address bar right up to the moment it bounces.
 * `//evil.example` and `/\evil.example` are both read by browsers as
 * another host, which is why a leading slash alone is not enough.
 */
export function safeNextPath(next: string | null): string {
  if (!next?.startsWith('/')) return '/book';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/book';

  return next;
}

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
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
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
      router.push(safeNextPath(searchParams.get('next')));
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
      {/* Where the password form sends someone after a change: every
          session was revoked, including theirs, and without this line the
          sign-in page gives no reason for having appeared. */}
      {searchParams.get('passwordChanged') === '1' && formError === null && (
        <p
          role="status"
          className="border-border-strong rounded-md border px-3 py-2 text-sm"
        >
          {t('login.passwordChanged')}
        </p>
      )}

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
        label={t('email')}
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
        label={t('password')}
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
        {submitting ? t('signingIn') : t('signIn')}
      </Button>
    </form>
  );
}
