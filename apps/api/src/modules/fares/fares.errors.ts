import { UnprocessableError } from '../../common/errors/domain-error';

/**
 * The route is longer than this platform serves.
 *
 * `estimateFare` will happily price a 400 km journey — it is pure
 * arithmetic and has no opinion about geography. Somebody has to hold that
 * opinion, and it belongs here rather than in the engine: the ceiling is a
 * business decision that will change, and the engine is a function that
 * should not.
 *
 * 422, not 400: the coordinates are individually valid and the route is
 * real. It is simply not one we will carry, and no amount of retrying
 * changes that.
 */
export class RouteTooLongError extends UnprocessableError {
  public readonly code = 'ROUTE_TOO_LONG';
  public readonly title = 'That journey is too long';

  public constructor(distanceMetres: number, maxMetres: number) {
    super(
      `That journey is about ${Math.round(distanceMetres / 1000)} km. ` +
        `We currently serve trips up to ${Math.round(maxMetres / 1000)} km.`,
    );
  }
}
