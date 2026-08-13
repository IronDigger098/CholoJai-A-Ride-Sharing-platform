'use client';

import { updateProfileRequestSchema, type UserSummary } from '@cholojai/shared';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { updateProfile } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * Name, phone, avatar.
 *
 * Sends every field every time, which looks wasteful for a PATCH and is the
 * right thing here: this form renders all three, so it knows the complete
 * intended state of all three. The nullable-optional distinction on the
 * contract exists for clients that *don't* — a future mobile screen editing
 * only a name must not blank a number it never showed.
 *
 * Email is displayed and not editable. Changing it needs the new address
 * verified while the old one still works, which is a flow rather than a
 * field, and an input that silently refused would be worse than none.
 */
export function ProfileForm({ user }: { user: UserSummary }): ReactNode {
  const id = useId();

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);
    setSaved(false);

    const parsed = updateProfileRequestSchema.safeParse({
      fullName,
      /* Empty means "remove it", which is null rather than an empty string —
         the column is nullable and `''` would be a phone number nobody has. */
      phone: phone.trim() === '' ? null : phone.trim(),
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
    setSaving(true);

    try {
      await updateProfile(parsed.data);
      setSaved(true);
    } catch (cause) {
      const error = toApiError(cause);
      const fieldErrors = Object.fromEntries(
        error.fieldErrors.map((field) => [field.path, field.message]),
      );

      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFormError(error.message);
    } finally {
      setSaving(false);
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
      <h2 className="text-lg font-medium">Profile</h2>

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
        value={fullName}
        onChange={(event) => {
          setFullName(event.target.value);
        }}
        {...(errors['fullName'] === undefined
          ? {}
          : { error: errors['fullName'] })}
      />

      <Field
        id={`${id}-phone`}
        label="Phone"
        hint="11 digits starting 01. Leave blank to remove it."
        inputMode="numeric"
        autoComplete="tel"
        value={phone}
        onChange={(event) => {
          setPhone(event.target.value);
        }}
        {...(errors['phone'] === undefined ? {} : { error: errors['phone'] })}
      />

      {/* Shown because people forget which address they used, disabled
          because changing it is a verification flow rather than an edit. */}
      <Field
        id={`${id}-email`}
        label="Email address"
        hint="Contact support to change this."
        value={user.email}
        readOnly
        disabled
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>

        {saved && (
          <p role="status" className="text-content-muted text-sm">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
