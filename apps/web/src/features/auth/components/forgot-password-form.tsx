'use client';

import { forgotPasswordRequestSchema } from '@cholojai/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { forgotPassword } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * Ask for a password-reset link.
 *
 * The confirmation reads the same whether or not the address has an
 * account, because the API answers the same either way. Saying "no such
 * account" here would undo that and turn the form into a way to test which
 * addresses are registered.
 */
export function ForgotPasswordForm(): ReactNode {
  const id = useId();
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('forgot.enterEmail'));
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await forgotPassword(parsed.data);
      setSent(true);
    } catch (cause) {
      setError(toApiError(cause).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="text-sm">
        {t.rich('forgot.sent', {
          email,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
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
      <Field
        id={`${id}-email`}
        label={t('email')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
        {...(error === null ? {} : { error })}
      />

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t('forgot.sending') : t('forgot.send')}
      </Button>
    </form>
  );
}
