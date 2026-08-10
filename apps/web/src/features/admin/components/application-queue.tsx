'use client';

import {
  DriverApplicationStatus,
  rejectDriverApplicationSchema,
} from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useId, useState } from 'react';

import {
  approveDriverApplication,
  listDriverApplications,
  rejectDriverApplication,
} from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * The driver application review queue.
 *
 * Decisions are irreversible by design — the API refuses to decide an
 * application twice — so both of them are two deliberate actions here.
 * Approving asks for confirmation; rejecting asks for the reason it
 * requires, which doubles as the confirmation step.
 */

const STATUS_LABEL: Record<DriverApplicationStatus, string> = {
  [DriverApplicationStatus.PENDING]: 'Pending',
  [DriverApplicationStatus.APPROVED]: 'Approved',
  [DriverApplicationStatus.REJECTED]: 'Rejected',
};

const STATUS_ORDER = [
  DriverApplicationStatus.PENDING,
  DriverApplicationStatus.APPROVED,
  DriverApplicationStatus.REJECTED,
] as const;

export function ApplicationQueue(): ReactNode {
  const queryClient = useQueryClient();
  const id = useId();

  const [status, setStatus] = useState<DriverApplicationStatus>(
    DriverApplicationStatus.PENDING,
  );
  /* Which row has its rejection form open, and what has been typed into it.
     One at a time: a reason belongs to an application, and two half-written
     reasons on screen is an invitation to submit the wrong one. */
  const [rejecting, setRejecting] = useState<{
    driverProfileId: string;
    reason: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: applications = [], isPending } = useQuery({
    queryKey: ['driver-applications', status],
    queryFn: () => listDriverApplications(status),
  });

  function settle(): void {
    setRejecting(null);
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['driver-applications'] });
  }

  function fail(cause: unknown): void {
    setError(toApiError(cause).message);
  }

  const approve = useMutation({
    mutationFn: approveDriverApplication,
    onSuccess: settle,
    onError: fail,
  });

  const reject = useMutation({
    mutationFn: rejectDriverApplication,
    onSuccess: settle,
    onError: fail,
  });

  function confirmRejection(): void {
    if (rejecting === null) return;

    const parsed = rejectDriverApplicationSchema.safeParse({
      reason: rejecting.reason,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          'Give a reason the applicant can act on',
      );
      return;
    }

    reject.mutate({
      driverProfileId: rejecting.driverProfileId,
      reason: parsed.data.reason,
    });
  }

  const busy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-6">
      {error !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${id}-status`} className="block text-sm font-medium">
          Showing
        </label>
        <select
          id={`${id}-status`}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as DriverApplicationStatus);
            setRejecting(null);
            setError(null);
          }}
          className="border-border-strong bg-surface text-content h-11 rounded-md border px-3 text-sm"
        >
          {STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </div>

      {isPending && (
        <p role="status" className="text-content-muted text-sm">
          Loading…
        </p>
      )}

      {!isPending && applications.length === 0 && (
        <p className="text-content-muted text-sm">
          Nothing {STATUS_LABEL[status].toLowerCase()}.
        </p>
      )}

      <ul className="space-y-3">
        {applications.map((application) => (
          <li
            key={application.id}
            className="border-border-strong space-y-3 rounded-md border px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {application.fullName}
                </span>
                <span className="text-content-subtle block truncate text-xs">
                  {application.email}
                </span>
              </span>

              <span className="text-content-subtle shrink-0 text-xs">
                {new Date(application.createdAt).toLocaleDateString()}
              </span>
            </div>

            <p className="text-content-subtle text-xs">
              {/* The masked licence is all the platform keeps. Shown because
                  it is the only thing tying this application to a document
                  the applicant can be asked about. */}
              Licence {application.licenseNoMasked ?? 'not recorded'}
            </p>

            {application.rejectionReason !== null && (
              <p className="text-content-muted text-xs">
                Rejected: {application.rejectionReason}
              </p>
            )}

            {application.applicationStatus ===
              DriverApplicationStatus.PENDING &&
              (rejecting?.driverProfileId === application.id ? (
                <div className="space-y-3">
                  <Field
                    id={`${id}-reason`}
                    label="Reason for rejection"
                    hint="The applicant sees this. Say what would need to change."
                    value={rejecting.reason}
                    onChange={(event) => {
                      setRejecting({
                        driverProfileId: application.id,
                        reason: event.target.value,
                      });
                    }}
                  />

                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={confirmRejection}
                    >
                      {reject.isPending ? 'Rejecting…' : 'Confirm rejection'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRejecting(null);
                        setError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </span>
                </div>
              ) : (
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      approve.mutate(application.id);
                    }}
                  >
                    {approve.isPending ? 'Approving…' : 'Approve'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRejecting({
                        driverProfileId: application.id,
                        reason: '',
                      });
                      setError(null);
                    }}
                  >
                    Reject
                  </Button>
                </span>
              ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
