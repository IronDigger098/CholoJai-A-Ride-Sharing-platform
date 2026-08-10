'use client';

import {
  createVehicleRequestSchema,
  VEHICLE_TYPE_ORDER,
  type VehicleType,
} from '@cholojai/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import {
  activateVehicle,
  createVehicle,
  listVehicles,
  removeVehicle,
} from '../api';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { toApiError } from '@/lib/api-error';

/**
 * A driver's vehicles.
 *
 * The active one is what a ride is dispatched in, so it is stated rather
 * than implied by position — a list where the meaningful one is merely first
 * is a list people misread.
 */
export function VehicleManager(): ReactNode {
  const queryClient = useQueryClient();
  const id = useId();

  const [form, setForm] = useState({
    type: 'CNG' as VehicleType,
    make: '',
    model: '',
    plateNo: '',
  });
  const [error, setError] = useState<string | null>(null);

  const { data: vehicles = [], isPending } = useQuery({
    queryKey: ['vehicles'],
    queryFn: listVehicles,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
  }

  const add = useMutation({
    mutationFn: createVehicle,
    onSuccess: () => {
      setForm({ type: 'CNG', make: '', model: '', plateNo: '' });
      setError(null);
      invalidate();
    },
    onError: (cause: unknown) => {
      setError(toApiError(cause).message);
    },
  });

  const activate = useMutation({
    mutationFn: activateVehicle,
    onSuccess: invalidate,
    onError: (cause: unknown) => {
      setError(toApiError(cause).message);
    },
  });

  const remove = useMutation({
    mutationFn: removeVehicle,
    onSuccess: invalidate,
    onError: (cause: unknown) => {
      setError(toApiError(cause).message);
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const parsed = createVehicleRequestSchema.safeParse(form);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the vehicle details');
      return;
    }

    add.mutate(parsed.data);
  }

  return (
    <div className="space-y-8">
      {error !== null && (
        <p
          role="alert"
          className="border-danger text-danger rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <section aria-labelledby={`${id}-list-heading`} className="space-y-3">
        <h2 id={`${id}-list-heading`} className="text-sm font-medium">
          Your vehicles
        </h2>

        {isPending && (
          <p role="status" className="text-content-muted text-sm">
            Loading…
          </p>
        )}

        {!isPending && vehicles.length === 0 && (
          <p className="text-content-muted text-sm">
            No vehicles yet. Add one below — the first becomes your active
            vehicle.
          </p>
        )}

        <ul className="space-y-2">
          {vehicles.map((vehicle) => (
            <li
              key={vehicle.id}
              className="border-border-strong flex items-center justify-between gap-4 rounded-md border px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {vehicle.make} {vehicle.model}
                </span>
                <span className="text-content-subtle block text-xs">
                  {vehicle.type} · {vehicle.plateNo}
                  {vehicle.isActive ? ' · Active' : ''}
                </span>
              </span>

              <span className="flex shrink-0 gap-2">
                {!vehicle.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      activate.mutate(vehicle.id);
                    }}
                  >
                    Make active
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    remove.mutate(vehicle.id);
                  }}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${id}-add-heading`}>
        <h2 id={`${id}-add-heading`} className="mb-4 text-sm font-medium">
          Add a vehicle
        </h2>

        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-type`} className="block text-sm font-medium">
              Type
            </label>
            <select
              id={`${id}-type`}
              value={form.type}
              onChange={(event) => {
                setForm({ ...form, type: event.target.value as VehicleType });
              }}
              className="border-border-strong bg-surface text-content h-11 w-full rounded-md border px-3 text-sm"
            >
              {VEHICLE_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <Field
            id={`${id}-make`}
            label="Make"
            value={form.make}
            onChange={(event) => {
              setForm({ ...form, make: event.target.value });
            }}
          />

          <Field
            id={`${id}-model`}
            label="Model"
            value={form.model}
            onChange={(event) => {
              setForm({ ...form, model: event.target.value });
            }}
          />

          <Field
            id={`${id}-plate`}
            label="Plate number"
            hint="Spaces and dashes are ignored."
            value={form.plateNo}
            onChange={(event) => {
              setForm({ ...form, plateNo: event.target.value });
            }}
          />

          <Button type="submit" disabled={add.isPending} className="w-full">
            {add.isPending ? 'Adding…' : 'Add vehicle'}
          </Button>
        </form>
      </section>
    </div>
  );
}
