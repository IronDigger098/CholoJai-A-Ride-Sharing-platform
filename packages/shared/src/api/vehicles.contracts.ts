import { z } from 'zod';

import { VehicleType } from '../domain/vehicle';

/**
 * Vehicle contracts — `docs/api-design.md` §Vehicles.
 */

/**
 * Plate numbers are normalised before they are stored.
 *
 * Uppercased and stripped of spaces and dashes, because the same plate
 * written "DHA-KA 12-3456" and "dhaka123456" must collide on the unique
 * index rather than register twice. Normalising in the schema means the
 * browser and the API agree on what "the same plate" means, instead of the
 * database being the only place that finds out they disagreed.
 */
export const plateNoSchema = z
  .string()
  .trim()
  .min(4)
  .max(24)
  .transform((value) => value.toUpperCase().replace(/[\s-]/gu, ''));

export const createVehicleRequestSchema = z.object({
  type: z.nativeEnum(VehicleType),
  make: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(50),
  plateNo: plateNoSchema,
});

export type CreateVehicleRequest = z.infer<typeof createVehicleRequestSchema>;

export const vehicleSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(VehicleType),
  make: z.string(),
  model: z.string(),
  plateNo: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});

export type Vehicle = z.infer<typeof vehicleSchema>;

export const vehicleListSchema = z.object({
  vehicles: z.array(vehicleSchema),
});

export type VehicleList = z.infer<typeof vehicleListSchema>;

export const vehicleIdParamSchema = z.object({
  vehicleId: z.string().min(1).max(64),
});

export type VehicleIdParam = z.infer<typeof vehicleIdParamSchema>;
