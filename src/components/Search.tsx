import { algoliasearch } from 'algoliasearch';
import {
    InstantSearch,
    SearchBox,
    Hits,
    RefinementList,
    Pagination,
    Highlight,
} from 'react-instantsearch';

import type { FC } from 'react';
import type { RecordHit } from '../types/RecordHit';
const searchClient = algoliasearch('ZLPYTBTZ4R', 'be46d26dfdb299f9bee9146b63c99c77')


const Hit: FC<{ hit: RecordHit }> = ({ hit }) => (
    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 hover:shadow-md transition-all">
        <h2 className="text-xl font-semibold text-blue-900 mb-2 leading-tight">
            <Highlight hit={hit} attribute="title" />
        </h2>
        <dl className="text-sm text-gray-700 space-y-1">
            {hit.creator && (
                <div>
                    <dt className="inline font-medium">Author:</dt>{' '}
                    <dd className="inline">{hit.creator}</dd>
                </div>
            )}
            {hit.year && (
                <div>
                    <dt className="inline font-medium">Year:</dt>{' '}
                    <dd className="inline">{hit.year}</dd>
                </div>
            )}
            {hit.place && (
                <div>
                    <dt className="inline font-medium">Place:</dt>{' '}
                    <dd className="inline">{hit.place}</dd>
                </div>
            )}
        </dl>
        {hit.url && (
            <div className="mt-3">
                <a
                    href={hit.url}
                    className="text-sm font-medium text-blue-600 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    View Record ↗
                </a>
            </div>
        )}
    </div>
);

const SearchApp: FC = () => (
    <InstantSearch searchClient={searchClient} indexName="dev_Singerman">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Sidebar Filters */}
            <aside className="space-y-6 bg-white p-4 border border-gray-200 rounded-xl shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Filter</h2>
                <RefinementList attribute="creator" searchable />
                <RefinementList attribute="place" searchable />
                <RefinementList attribute="language" searchable />
                <RefinementList attribute="type" searchable />
            </aside>

            {/* Results */}
            <section className="md:col-span-3 space-y-6">
                <SearchBox
                    placeholder="Search titles, authors, or topics..."
                    classNames={{
                        root: 'w-full',
                        input:
                            'w-full rounded-xl border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                    }}
                />
                <Hits hitComponent={Hit} />
                <div className="pt-4">
                    <Pagination />
                </div>
            </section>
        </div>
    </InstantSearch>
);

export default SearchApp;