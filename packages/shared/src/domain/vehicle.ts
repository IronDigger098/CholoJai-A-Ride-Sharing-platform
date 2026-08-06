/** Vehicle taxonomy — `docs/domain-model.md` §4. */

export const VehicleType = {
  BIKE: 'BIKE',
  CNG: 'CNG',
  CAR: 'CAR',
} as const;

export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];

export interface VehicleTypeMeta {
  readonly type: VehicleType;
  /** English display label. Bangla labels come from the i18n layer in M10. */
  readonly label: string;
  readonly maxPassengers: number;
}

export const VEHICLE_TYPE_META = {
  BIKE: { type: 'BIKE', label: 'Bike', maxPassengers: 1 },
  CNG: { type: 'CNG', label: 'CNG', maxPassengers: 3 },
  CAR: { type: 'CAR', label: 'Car', maxPassengers: 4 },
} as const satisfies Readonly<Record<VehicleType, VehicleTypeMeta>>;

/** Display order for vehicle pickers — cheapest first. */
export const VEHICLE_TYPE_ORDER = [
  VehicleType.BIKE,
  VehicleType.CNG,
  VehicleType.CAR,
] as const;
