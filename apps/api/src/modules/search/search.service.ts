import {
  HELP_ARTICLES,
  type HelpArticle,
  SEARCH_KIND_ORDER,
  type SearchResponse,
  type SearchResult,
  SearchResultKind,
} from '@cholojai/shared';
import { Inject, Injectable } from '@nestjs/common';

import { PlacesService } from '../places/places.service';
import {
  RIDE_REPOSITORY,
  type RideRepository,
} from '../rides/ride-repository.port';

/**
 * One query, three sources, one ordered list.
 *
 * The sources are asked in parallel and concatenated in a fixed order —
 * places, then rides, then help — rather than merged by score. There is no
 * score, and inventing one would mean claiming a ride is 0.7 relevant and a
 * help article 0.6, numbers with no unit and nothing to calibrate against.
 * See `search.contracts.ts` for the longer version of that argument.
 *
 * Reads the ride *repository* rather than `RidesService`. The service's
 * methods are about one ride at a time and enforce ownership per call;
 * search wants a scoped list, and going through the port keeps this module
 * out of the rides module's dependency graph — rides already depends on
 * payments, coupons, notifications and vehicles, and adding a reverse edge
 * for a read would be the start of a cycle.
 */
@Injectable()
export class SearchService {
  public constructor(
    private readonly places: PlacesService,
    @Inject(RIDE_REPOSITORY) private readonly rides: RideRepository,
  ) {}

  public async search(
    userId: string,
    query: string,
    limit: number,
  ): Promise<SearchResponse> {
    /* In parallel. Three independent reads, and the slowest decides the
       response time rather than their sum. */
    const [places, rides] = await Promise.all([
      this.places.search(userId, query, limit),
      this.rides.searchForRider(userId, query, limit),
    ]);

    const help = searchHelp(query, limit);

    /* Keyed by kind, then flattened through SEARCH_KIND_ORDER — so the
       exported constant is what actually decides the order rather than a
       comment claiming it does. A client rendering headings from the same
       constant cannot drift out of step with the server. */
    const byKind: Record<SearchResultKind, SearchResult[]> = {
      [SearchResultKind.PLACE]: places.map((place) => ({
        kind: SearchResultKind.PLACE,
        id: place.id,
        label: place.label,
        address: place.address,
      })),
      [SearchResultKind.RIDE]: rides.map((ride) => ({
        kind: SearchResultKind.RIDE,
        id: ride.id,
        pickupAddress: ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        farePaisa: ride.fare.total,
        requestedAt: ride.requestedAt.toISOString(),
      })),
      [SearchResultKind.HELP]: help.map((article) => ({
        kind: SearchResultKind.HELP,
        slug: article.slug,
        question: article.question,
        answer: article.answer,
      })),
    };

    return { results: SEARCH_KIND_ORDER.flatMap((kind) => byKind[kind]) };
  }
}

/**
 * Help, ranked by where the match landed.
 *
 * A hit in the question outranks one in the keywords, which outranks one in
 * the answer — because a question is what the article is *about*, while an
 * answer may mention a word in passing. That ordering is defensible within
 * this source in a way no cross-source score would be: all three candidates
 * are the same kind of thing, so comparing them is meaningful.
 *
 * In memory over a dozen entries. A search index for twelve paragraphs
 * would be more machinery than content.
 */
function searchHelp(query: string, limit: number): readonly HelpArticle[] {
  const needle = query.toLowerCase();

  const scored = HELP_ARTICLES.map((article) => ({
    article,
    rank: rankOf(article, needle),
  })).filter((entry) => entry.rank > 0);

  /* Stable within a rank: `sort` is stable in every engine we target, so
     equally-ranked articles keep the order they are written in, which is
     roughly most-asked first. */
  scored.sort((a, b) => b.rank - a.rank);

  return scored.slice(0, limit).map((entry) => entry.article);
}

/** 3 for a question hit, 2 for a keyword, 1 for the answer, 0 for none. */
function rankOf(article: HelpArticle, needle: string): number {
  if (article.question.toLowerCase().includes(needle)) return 3;

  if (article.keywords.some((keyword) => keyword.includes(needle))) return 2;

  if (article.answer.toLowerCase().includes(needle)) return 1;

  return 0;
}
