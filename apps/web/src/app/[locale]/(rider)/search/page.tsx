import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SearchScreen } from '@/features/search/components/search-screen';

export const metadata: Metadata = {
  title: 'Search',
  /* Not indexed. Two of the three sources are the signed-in rider's own
     data, so there is nothing here a crawler could see and nothing worth
     ranking if it could. */
  robots: { index: false, follow: false },
};

export default function SearchPage(): ReactNode {
  return <SearchScreen />;
}
