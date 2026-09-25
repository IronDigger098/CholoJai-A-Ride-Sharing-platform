'use client';

import { changePasswordRequestSchema } from '@cholojai/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { changePassword } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useRouter } from '@/i18n/navigation';
import { toApiError } from '@/lib/api-error';

/**
 * Change a password, knowing it will sign you out.
 *
 * The warning is above the button rather than in a toast afterwards. Being
 * signed out is the *feature* — it is what locks out the lost phone this
 * form exists for — but a rider who discovers it after the fact experiences
 * it as the app breaking. Told first, it reads as the thing working.
 */
export function PasswordForm(): ReactNode {
  const router = useRouter();
  const id = useId();
  const t = useTranslations('settings');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword,
      newPassword,
    });

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
    setChanging(true);

    try {
      await changePassword(parsed.data);

      /* Straight to sign-in. The refresh token this tab holds was revoked
         by the request that just succeeded, so staying here would mean the
         next call fails and the rider is bounced anyway — with a confusing
         error instead of an explanation. */
      router.push('/login?passwordChanged=1');
    } catch (cause) {
      const error = toApiError(cause);
      const fieldErrors = Object.fromEntries(
        error.fieldErrors.map((field) => [field.path, field.message]),
      );

      /* The API answers 422 with a code rather than attaching the message
         to a field, so it lands beside the input it is about. */
      if (error.code === 'CURRENT_PASSWORD_INCORRECT') {
        setErrors({ currentPassword: error.message });
      } else {
        setErrors(fieldErrors);
        if (Object.keys(fieldErrors).length === 0) setFormError(error.message);
      }

      setChanging(false);
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
      <h2 className="text-lg font-medium">{t('password')}</h2>

      {formError !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      )}

      <Field
        id={`${id}-current`}
        label={t('currentPassword')}
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => {
          setCurrentPassword(event.target.value);
        }}
        {...(errors['currentPassword'] === undefined
          ? {}
          : { error: errors['currentPassword'] })}
      />

      <Field
        id={`${id}-new`}
        label={t('newPassword')}
        type="password"
        autoComplete="new-password"
        hint={t('newPasswordHint')}
        value={newPassword}
        onChange={(event) => {
          setNewPassword(event.target.value);
        }}
        {...(errors['newPassword'] === undefined
          ? {}
          : { error: errors['newPassword'] })}
      />

      <p className="text-content-muted text-sm">{t('signOutWarning')}</p>

      <Button type="submit" disabled={changing}>
        {changing ? t('changing') : t('changePassword')}
      </Button>
    </form>
  );
}
