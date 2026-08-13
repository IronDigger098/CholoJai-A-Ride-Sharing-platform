import { type SearchResponse, searchResponseSchema } from '@cholojai/shared';

import { apiClient } from '@/lib/api-client';

/** Global search. One call, three sources, already grouped by the server. */
export async function search(query: string): Promise<SearchResponse> {
  const response = await apiClient.get('/search', { params: { q: query } });

  return searchResponseSchema.parse(response.data);
}
