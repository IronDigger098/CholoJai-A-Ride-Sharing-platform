'use client';

import {
  DriverApplicationStatus,
  driverApplicationRequestSchema,
} from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { applyToDrive, getMyDriverProfile } from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Link } from '@/components/ui/link';
import { toApiError } from '@/lib/api-error';

/**
 * Apply to drive, or see where an existing application stands.
 *
 * One component for both because they are one screen: a driver who has
 * applied should see their status here rather than a form that will 409.
 */
export function DriverApplication(): ReactNode {
  const queryClient = useQueryClient();
  const id = useId();

  const [licenseNo, setLicenseNo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: profile, isPending } = useQuery({
    queryKey: ['driver', 'me'],
    queryFn: getMyDriverProfile,
  });

  const apply = useMutation({
    mutationFn: applyToDrive,
    onSuccess: (created) => {
      queryClient.setQueryData(['driver', 'me'], created);
      setError(null);
    },
    onError: (cause: unknown) => {
      setError(toApiError(cause).message);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const parsed = driverApplicationRequestSchema.safeParse({ licenseNo });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your licence number');
      return;
    }

    apply.mutate(parsed.data);
  }

  if (isPending) {
    return (
      <p role="status" className="text-content-muted text-sm">
        Loading…
      </p>
    );
  }

  if (profile !== null && profile !== undefined) {
    return (
      <ApplicationStatus
        status={profile.applicationStatus}
        reason={profile.rejectionReason}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <Field
        id={`${id}-licence`}
        label="Driving licence number"
        hint="We store only the last four characters."
        value={licenseNo}
        onChange={(event) => {
          setLicenseNo(event.target.value);
        }}
      />

      <Button type="submit" disabled={apply.isPending} className="w-full">
        {apply.isPending ? 'Submitting…' : 'Apply to drive'}
      </Button>
    </form>
  );
}

function ApplicationStatus({
  status,
  reason,
}: {
  status: DriverApplicationStatus;
  reason: string | null;
}): ReactNode {
  if (status === DriverApplicationStatus.APPROVED) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium">You are approved to drive.</p>
        <p className="text-content-muted">
          Add a vehicle and make it active before accepting rides.
        </p>
        <p>
          <Link href="/drive/vehicles">Manage vehicles</Link> ·{' '}
          <Link href="/drive">Go to dashboard</Link>
        </p>
      </div>
    );
  }

  if (status === DriverApplicationStatus.REJECTED) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">Your application was not approved.</p>
        {/* The reason is required server-side precisely so there is always
            something to show here. */}
        <p className="text-content-muted">{reason ?? 'No reason was given.'}</p>
      </div>
    );
  }

  return (
    <p role="status" className="text-sm">
      Your application is being reviewed. We will email you when there is a
      decision.
    </p>
  );
}
