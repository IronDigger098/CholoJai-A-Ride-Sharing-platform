import { VehicleType } from '@cholojai/shared';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { InMemoryVehicleRepository } from '../../testing/in-memory-vehicle.repository';
import { DriverNotApprovedError } from '../drivers/drivers.errors';
import { type DriversService } from '../drivers/drivers.service';

import {
  PlateAlreadyRegisteredError,
  VehicleNotFoundError,
} from './vehicles.errors';
import { VehiclesService } from './vehicles.service';

const DRIVER_USER = 'user_driver_1';
const DRIVER_PROFILE = 'driver_1';

/** Only `requireApprovedProfileId` is reachable from this service. */
function makeDrivers(approved = true): DriversService {
  return {
    requireApprovedProfileId: (userId: string) =>
      approved && userId === DRIVER_USER
        ? Promise.resolve(DRIVER_PROFILE)
        : Promise.reject(new DriverNotApprovedError()),
  } as unknown as DriversService;
}

const CAR = {
  type: VehicleType.CAR,
  make: 'Toyota',
  model: 'Axio',
  plateNo: 'DHAKA123456',
};

const BIKE = {
  type: VehicleType.BIKE,
  make: 'Honda',
  model: 'CB',
  plateNo: 'DHAKA654321',
};

describe('VehiclesService', () => {
  let vehicles: InMemoryVehicleRepository;
  let service: VehiclesService;

  beforeEach(() => {
    vehicles = new InMemoryVehicleRepository();
    service = new VehiclesService(vehicles, makeDrivers());
  });

  it('makes the first vehicle active', async () => {
    const vehicle = await service.create(DRIVER_USER, CAR);

    expect(vehicle.isActive).toBe(true);
  });

  it('does not switch the active vehicle when another is added', async () => {
    /* Registering a second vehicle should not silently change which one the
       driver is about to be dispatched in. */
    await service.create(DRIVER_USER, CAR);

    const second = await service.create(DRIVER_USER, BIKE);

    expect(second.isActive).toBe(false);
  });

  it('refuses a plate that is already registered', async () => {
    await service.create(DRIVER_USER, CAR);

    await expect(
      service.create(DRIVER_USER, { ...BIKE, plateNo: CAR.plateNo }),
    ).rejects.toThrow(PlateAlreadyRegisteredError);
  });

  it('leaves exactly one vehicle active after a switch', async () => {
    /* The invariant the partial unique index enforces. Asserted through the
       service because that is where a caller would break it. */
    const first = await service.create(DRIVER_USER, CAR);
    const second = await service.create(DRIVER_USER, BIKE);

    await service.activate(DRIVER_USER, second.id);
    const all = await service.list(DRIVER_USER);

    expect(all.filter((vehicle) => vehicle.isActive)).toHaveLength(1);
    expect(all.find((vehicle) => vehicle.id === first.id)?.isActive).toBe(
      false,
    );
  });

  it('lists the active vehicle first', async () => {
    await service.create(DRIVER_USER, CAR);
    const second = await service.create(DRIVER_USER, BIKE);
    await service.activate(DRIVER_USER, second.id);

    const all = await service.list(DRIVER_USER);

    expect(all[0]?.id).toBe(second.id);
  });

  it('hides another driver’s vehicle behind a 404', async () => {
    const vehicle = await service.create(DRIVER_USER, CAR);
    const other = new VehiclesService(vehicles, {
      requireApprovedProfileId: () => Promise.resolve('driver_2'),
    } as unknown as DriversService);

    await expect(other.activate('user_driver_2', vehicle.id)).rejects.toThrow(
      VehicleNotFoundError,
    );
  });

  it('refuses every operation without an approved application', async () => {
    /* The DRIVER role alone is not enough — it can be granted a moment
       before the application is approved. */
    const unapproved = new VehiclesService(vehicles, makeDrivers(false));

    await expect(unapproved.create(DRIVER_USER, CAR)).rejects.toThrow(
      DriverNotApprovedError,
    );
    await expect(unapproved.list(DRIVER_USER)).rejects.toThrow(
      DriverNotApprovedError,
    );
  });

  it('removes a vehicle the driver owns', async () => {
    const vehicle = await service.create(DRIVER_USER, CAR);

    await service.remove(DRIVER_USER, vehicle.id);

    expect(await service.list(DRIVER_USER)).toEqual([]);
  });

  it('reports removing an unknown vehicle as not found', async () => {
    await expect(service.remove(DRIVER_USER, 'vehicle_nope')).rejects.toThrow(
      VehicleNotFoundError,
    );
  });
});
