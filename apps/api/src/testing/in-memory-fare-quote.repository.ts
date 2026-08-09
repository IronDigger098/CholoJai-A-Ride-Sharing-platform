import {
  type CreateFareQuoteInput,
  type FareQuoteRecord,
  type FareQuoteRepository,
} from '../modules/fares/fare-quote-repository.port';

/**
 * In-memory {@link FareQuoteRepository}.
 *
 * Shared rather than per-suite: the fares module writes quotes and the rides
 * module (M5.4) reads them back, so two suites need the same behaviour —
 * including the part that matters most, which is that `findById` returns
 * expired rows rather than hiding them.
 */
export class InMemoryFareQuoteRepository implements FareQuoteRepository {
  private readonly rows = new Map<string, FareQuoteRecord>();
  private sequence = 0;

  public async create(input: CreateFareQuoteInput): Promise<FareQuoteRecord> {
    this.sequence += 1;
    const record: FareQuoteRecord = { ...input, id: `quote_${this.sequence}` };
    this.rows.set(record.id, record);
    return record;
  }

  public async findById(id: string): Promise<FareQuoteRecord | null> {
    return this.rows.get(id) ?? null;
  }

  public get size(): number {
    return this.rows.size;
  }
}
