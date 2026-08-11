'use client';

import { submitContactMessageRequestSchema } from '@cholojai/shared';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { submitContactMessage } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * Write to support.
 *
 * Validated client-side against the *same* Zod schema the API validates
 * against (ADR-005). The client check answers instantly; it is not trusted,
 * because the server runs the identical schema and the two cannot drift.
 *
 * No account is required and none is asked for. Somebody who cannot sign in
 * is exactly the person most likely to need this page, and a sign-in wall
 * here would close the door on the cases it exists for.
 */
export function ContactForm(): ReactNode {
  const id = useId();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = submitContactMessageRequestSchema.safeParse({
      name,
      email,
      subject,
      message,
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
    setSubmitting(true);

    try {
      await submitContactMessage(parsed.data);
      setSent(true);
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

  /* The form is replaced rather than cleared. A blank form after submitting
     looks identical to a form that failed silently, and the one thing
     somebody writing to support needs to know is that it arrived. */
  if (sent) {
    return (
      <div
        role="status"
        className="border-border-strong rounded-md border px-4 py-6 text-sm"
      >
        <p className="font-medium">Thanks — your message is with us.</p>
        <p className="text-content-muted mt-1">
          We read everything that arrives here. If a reply is needed, it will
          come to {email}.
        </p>
      </div>
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
        label="Your name"
        autoComplete="name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
        {...(errors['name'] === undefined ? {} : { error: errors['name'] })}
      />

      <Field
        id={`${id}-email`}
        label="Email address"
        type="email"
        autoComplete="email"
        hint="Where a reply would go."
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
        {...(errors['email'] === undefined ? {} : { error: errors['email'] })}
      />

      <Field
        id={`${id}-subject`}
        label="Subject"
        value={subject}
        onChange={(event) => {
          setSubject(event.target.value);
        }}
        {...(errors['subject'] === undefined
          ? {}
          : { error: errors['subject'] })}
      />

      <div className="space-y-1.5">
        <label htmlFor={`${id}-message`} className="block text-sm font-medium">
          Message
        </label>

        {/* Not a `Field`: that component wraps an `input`, and a complaint
            about a ride does not fit on one line. The accessibility wiring
            is repeated here rather than the component being generalised for
            its second caller. */}
        <textarea
          id={`${id}-message`}
          rows={6}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
          aria-invalid={errors['message'] === undefined ? undefined : true}
          aria-describedby={
            errors['message'] === undefined ? undefined : `${id}-message-error`
          }
          className={`bg-surface text-content placeholder:text-content-subtle focus:ring-accent w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none ${
            errors['message'] === undefined
              ? 'border-border-strong'
              : 'border-danger'
          }`}
        />

        {errors['message'] !== undefined && (
          <p
            id={`${id}-message-error`}
            role="alert"
            className="text-danger text-xs"
          >
            {errors['message']}
          </p>
        )}
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}
