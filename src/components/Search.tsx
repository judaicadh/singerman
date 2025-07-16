import React from 'react';
import { liteClient as algoliasearch } from 'algoliasearch/lite';

import {
    InstantSearch,
    SearchBox,
    Hits,
    RefinementList,
    Pagination,
    Stats,
    Highlight, useRange, CurrentRefinements, HitsPerPage, Configure,
} from 'react-instantsearch';
import DateRangeSlider from "./DateRangeSlider.tsx";

import { history } from 'instantsearch.js/es/lib/routers';
import type { FC } from 'react';
import type { RecordHit } from '../types/RecordHit';
import { useMemo, useState, useEffect } from "react";
import CustomRefinementList from "./CustomRefinementList.tsx";
import HitCard from "./HitCard.tsx";
import { Grid } from '@mui/material';

import type {UiState} from "instantsearch.js";
const fallbackMin = Math.floor(new Date("1700-01-01T00:00:00Z").getTime() / 1000); // -8520336000
const fallbackMax = Math.floor(new Date("1900-12-31T23:59:59Z").getTime() / 1000); // -2208988801
const indexName = 'dev_Singerman';

const dateFields = [
    'startDate', 'endDate'
]
// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const normalizeToArray = (value: any): string[] =>
    Array.isArray(value) ? value : value ? [value] : [];
type RouteState = {
    query?: string;
    page?: number;
    author?: string[];
    contributor?: string[];
    place?: string[];
    language?: string[];
    collection?: string[];

};
const slugify = (str: string): string =>
    str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove accents
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // remove punctuation
        .replace(/\s+/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '');

const deslugify = (slug: string): string =>
    slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

const slugifyName = (str: string): string =>
    str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, '__amp__')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9.-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '');

const deslugifyName = (slug: string): string =>
    slug
        .replace(/\bamp\b/g, '&')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

// ─────────────────────────────────────────────────────────────
// Routing Configuration
// ─────────────────────────────────────────────────────────────
const routing = {
    router: history({
        createURL({ qsModule, location, routeState }) {
            const baseUrl = location.pathname.split('/search')[0] + '/search';
            const queryString = qsModule.stringify(routeState, {
                addQueryPrefix: true,
                arrayFormat: 'repeat',
            });
            return `${baseUrl}${queryString}`;
        },

        parseURL({ qsModule, location }) {
            const {
                query = '',
                page,
                creator = [],
                contributor = [],
                place = [],
                language = [],
                collection = [],
            } = qsModule.parse(location.search.slice(1), { ignoreQueryPrefix: true });

            return {
                [indexName]: {
                    query: decodeURIComponent(query as string),
                    page: typeof page === 'string' ? Number(page) : 1,
                    refinementList: {
                        creator: normalizeToArray(creator).map(deslugify),
                        contributor: normalizeToArray(contributor).map(deslugify),
                        place: normalizeToArray(place).map(deslugify),
                        language: normalizeToArray(language),
                        collection: normalizeToArray(collection),
                    },
                },
            };
        },
    }),

    stateMapping: {
        stateToRoute(uiState: UiState): any {
            const indexUiState = uiState[indexName] || {};
            return {
                query: indexUiState.query,
                page: indexUiState.page,
                author: (indexUiState.refinementList?.author || []).map(slugify),
                contributor: (indexUiState.refinementList?.contributor || []).map(slugify),
                place: (indexUiState.refinementList?.place || []).map(slugify),
                language: indexUiState.refinementList?.language || [],
                collection: (indexUiState.refinementList?.collection || []).map(slugify),
            };
        },

        routeToState(routeState: RouteState): UiState {
            return {
                [indexName]: {
                    query: routeState.query,
                    page: routeState.page,
                    refinementList: {
                        author: (normalizeToArray(routeState.author) || []).map(deslugify),
                        contributor: (normalizeToArray(routeState.contributor) || []).map(deslugify),
                        place: (normalizeToArray(routeState.place) || []).map(deslugify),
                        language: normalizeToArray(routeState.language) || [],
                        collection: (normalizeToArray(routeState.collection) || []).map(deslugify),
                    },
                },
            };
        },
    },
};

// ─────────────────────────────────────────────────────────────
// Algolia Setup
// ─────────────────────────────────────────────────────────────
const searchClient = algoliasearch(
    'ZLPYTBTZ4R',
    'be46d26dfdb299f9bee9146b63c99c77'
);

// ─────────────────────────────────────────────────────────────
// Result Hit Component
// ─────────────────────────────────────────────────────────────
const Hit: FC<{ hit: RecordHit }> = ({ hit }) => (
    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 min-h-[160px] flex flex-col justify-between hover:shadow-md transition-all">
        <div className="space-y-1">
            {hit.title && (
                <h2 className="text-xl font-semibold text-blue-900 leading-tight">
                    <Highlight hit={hit} attribute="title" />
                </h2>
            )}
            <dl className="text-sm text-gray-700">
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
        </div>

        {hit.url && (
            <div className="pt-3">
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
// ─────────────────────────────────────────────────────────────
// Main Search UI
// ─────────────────────────────────────────────────────────────
const SearchApp: FC = () => {
    const [resetKey, setResetKey] = useState(Date.now());
    const [dateRange, setDateRange] = useState<{ min: number; max: number } | undefined>(undefined);
    const [dateFilterActive, setDateFilterActive] = useState(false);
    const handleReset = () => {
        setResetKey(Date.now());
        setDateFilterActive(false);
        setDateRange(undefined); // ✅ clear date range when clearing all filters
    };

    return (
        <InstantSearch
            indexName={indexName}
            searchClient={searchClient}
            routing={routing}
        >
            <Configure hitsPerPage={8} />
            <CurrentRefinements />
            <Stats />

            <div className="grid grid-cols-1 md:grid-cols-6 gap-8">
                {/* Sidebar Filters */}
                <aside className="space-y-6 md:col-span-2">
                    {/* Wrap each group in its own “card” */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                            Filter
                        </h2>

                {/* Sidebar Filters */}
                        <RefinementList
                            attribute="collection"
                            title="Collection"
                            searchable={false}
                            showMore={false}
                            classNames={{
                                root: 'space-y-2 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm',
                                label: 'flex items-center justify-between gap-2 text-sm font-medium text-gray-900 dark:text-gray-100',
                                checkbox: 'w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600',
                                count:
                                    'ml-auto inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200',
                                noResults: 'text-sm text-gray-500 dark:text-gray-400 px-2 py-1 italic',
                                list: 'space-y-1',
                            }}
                        />

                        <div className="space-y-2 mt-2">
                            <h2 className="text-md font-display font-semibold text-gray-800 dark:text-gray-100">
                                Location
                            </h2>

                            <RefinementList
                                attribute="place"
                                searchable={true}
                                searchablePlaceholder={"Search location"}
                                showMore={true}
                                classNames={{
                                    root:
                                        ' p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm',
                                    label:
                                        'flex items-center justify-between gap-2 text-sm font-medium text-gray-900 dark:text-gray-100',
                                    checkbox:
                                        'w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600',
                                    count:
                                        'ml-auto inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200',
                                    list: 'space-y-1',
                                    noResults: 'text-sm text-gray-500 dark:text-gray-400 px-2 py-1 italic',
                                    searchBox:
                                        'relative w-full mb-2',
                                    showMore:
                                        'text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 disabled:text-gray-400 dark:disabled:text-gray-600 disabled:cursor-not-allowed',
                                }}
                            />
                        </div>
                        <div className="space-y-2 mt-2">
                            <h2 className="text-md font-display font-semibold text-gray-800 dark:text-gray-100">
                                Location
                            </h2>

                            <RefinementList
                                attribute="author"
                                searchable={true}
                                searchablePlaceholder={"Search location"}
                                showMore={true}
                                classNames={{
                                    root:
                                        ' p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm',
                                    label:
                                        'flex items-center justify-between gap-2 text-sm font-medium text-gray-900 dark:text-gray-100',
                                    checkbox:
                                        'w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600',
                                    count:
                                        'ml-auto inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200',
                                    list: 'space-y-1',
                                    noResults: 'text-sm text-gray-500 dark:text-gray-400 px-2 py-1 italic',
                                    searchBox:
                                        'relative w-full mb-2',
                                    showMore:
                                        'text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 disabled:text-gray-400 dark:disabled:text-gray-600 disabled:cursor-not-allowed',
                                }}
                            />
                        </div>


                        <DateRangeSlider
                            title="Date Range"
                            dateFields={['startDate', 'endDate']}
                            minTimestamp={-11676096000} // 1700-01-01
                            maxTimestamp={31536000} // 1900-12-31
                            value={dateRange}
                            onChange={(newValue) => {
                                setDateRange(newValue);
                                setDateFilterActive(true);
                            }}
                        />



                    </div>

                </aside>
                <section className="md:col-span-4 space-y-6">
                    <SearchBox
                        placeholder="Search titles, authors, or Singerman number..."
                        classNames={{
                            root: 'w-full',
                            input:
                                'w-full rounded-xl border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500',
                        }}
                    />
                    <CurrentRefinements />
                    <Stats />
                    <HitsPerPage
                        items={[
                            { label: '8 hits per page', value: 8, default: true },
                            { label: '16 hits per page', value: 16 },
                        ]}
                    />

                    <Hits
                        hitComponent={HitCard}
                        classNames={{
                            list: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
                        }}
                    />
                    <Pagination />
                </section>

                {/* Results */}
                <section className="md:col-span-4 space-y-6">




                </section>
            </div>
        </InstantSearch>
    );
};

export default SearchApp;