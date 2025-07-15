// src/components/Search/RelatedItems.tsx
import React from 'react';
import { algoliasearch  } from 'algoliasearch';
import {
    InstantSearch,
    Hits,
    Configure
} from 'react-instantsearch';
import { Highlight } from 'react-instantsearch';

// ─────────────────────────────────────────────────────────────
const searchClient = algoliasearch(
    'ZLPYTBTZ4R',
    'be46d26dfdb299f9bee9146b63c99c77'
);

const Hit = ({ hit }) => (
    <div className="p-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800">
        <h3 className="font-semibold text-blue-700">
            <Highlight hit={hit} attribute="title" />
        </h3>
        {hit.creator && <p className="text-sm">By: {hit.creator}</p>}
        <a href={`/item/${hit.slug}`} className="text-sm text-blue-500 hover:underline">
            View Item →
        </a>
    </div>
);

export default function RelatedItems({ relatedFacet, facetValue, excludeObjectID }) {
    if (!facetValue) return null;

    return (
        <InstantSearch searchClient={searchClient} indexName="dev_Singerman">
            <Configure
                facetFilters={[`${relatedFacet}:${facetValue}`]}
                hitsPerPage={3}
                filters={`NOT objectID:${excludeObjectID}`} // exclude self
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Hits hitComponent={Hit} />
            </div>
        </InstantSearch>
    );
}
