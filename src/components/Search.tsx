import * as React from 'react';
import { liteClient as algoliasearch } from 'algoliasearch/lite';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';

import {
    InstantSearch,
    SearchBox,
    Hits,
    RefinementList,
    Pagination,
    Stats,
    ToggleRefinement,
    Highlight, useRange, CurrentRefinements, HitsPerPage, Configure, useInstantSearch,
} from 'react-instantsearch';
import DateRangeSlider from "./DateRangeSlider";

import { history } from 'instantsearch.js/es/lib/routers';
import type { FC } from 'react';
import type { RecordHit } from '../types/RecordHit';
import { useMemo, useState, useEffect } from "react";
import HitListItem from "./HitCard";

import type {UiState} from "instantsearch.js";

import { Button } from '@mui/material';

const fallbackMin = Math.floor(new Date("1700-01-01T00:00:00Z").getTime() / 1000); // -8520336000
const fallbackMax = Math.floor(new Date("1900-12-31T23:59:59Z").getTime() / 1000); // -2208988801
const indexName = 'dev_Singerman';
const exportToRIS = (hits: RecordHit[]) => {
    const risContent = hits.map(hit => [
        'TY  - BOOK',
        `TI  - ${hit.title}`,
        `AU  - ${hit.author || hit.contributor || 'Anonymous'}`,
        `PY  - ${hit.year || ''}`,
        `CY  - ${hit.place || ''}`,
        `AB  - ${hit.description || ''}`,
        `ID  - Singerman ${hit.slug}`,
        'ER  - '
    ].join('\r\n')).join('\r\n\r\n');

    const blob = new Blob([risContent], { type: 'application/x-research-info-systems' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = hits.length === 1 ? `Singerman_${hits[0].id}.ris` : `Singerman_Collection.ris`;
    link.click();
    URL.revokeObjectURL(url);
};
const dateFields = [
    'startDate', 'endDate'
]
// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const normalizeToArray = (value: any): string[] =>
    Array.isArray(value) ? value : value ? [value] : [];
type RouteState = {
    [indexName: string]: {
        query?: string;
        page?: number;
        refinementList?: {
            author?: string[];
            contributor?: string[];
            place?: string[];
            language?: string[];
            collection?: string[];
        };
    };
};

const getQueryParam = (param: string) => {
    if (typeof window === "undefined") return "";
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param) || "";
};

const query = getQueryParam('query');
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


const routing = {
    router: history({
        windowTitle({ category, query }) {
            const queryTitle = query ? `Results for "${query}"` : 'Search';
            return category ? `${category} – ${queryTitle}` : queryTitle;
        },
        createURL({ qsModule, routeState, location }) {
            const urlParts = location.href.match(/^(.*?)\/search/);
            const baseUrl = `${urlParts ? urlParts[1] : ''}/`;

            const queryParameters = {};
            if (routeState.query) queryParameters.query = routeState.query;
            if (routeState.page && routeState.page !== 1) queryParameters.page = routeState.page;
            // Single or multiple
            if (routeState.author?.length) queryParameters.author = routeState.author;
            if (routeState.contributor?.length) queryParameters.contributor = routeState.contributor;
            if (routeState.place?.length) queryParameters.place = routeState.place;
            if (routeState.language?.length) queryParameters.language = routeState.language;
            if (routeState.collection?.length) queryParameters.collection = routeState.collection;

            const queryString = qsModule.stringify(queryParameters, {
                addQueryPrefix: true,
                arrayFormat: 'repeat', // key=val1&key=val2 (no [0]/[1])
            });
            return `${baseUrl}search/${queryString}`;
        },
        parseURL({ qsModule, location }) {
            const { query = '', page, author, contributor, place, language, collection } = qsModule.parse(
                location.search.slice(1)
            );
            // Always arrays
            const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
            return {
                query,
                page,
                author: asArray(author),
                contributor: asArray(contributor),
                place: asArray(place),
                language: asArray(language),
                collection: asArray(collection),
            };
        },
    }),
    stateMapping: {
        stateToRoute(uiState) {
            const state = uiState['dev_Singerman'] || {};
            return {
                query: state.query ?? '',
                page: state.page,
                author: state.refinementList?.author ?? [],
                contributor: state.refinementList?.contributor ?? [],
                place: state.refinementList?.place ?? [],
                language: state.refinementList?.language ?? [],
                collection: state.refinementList?.collection ?? [],
            };
        },
        routeToState(routeState) {
            return {
                dev_Singerman: {
                    query: routeState.query,
                    page: routeState.page,
                    refinementList: {
                        author: routeState.author ?? [],
                        contributor: routeState.contributor ?? [],
                        place: routeState.place ?? [],
                        language: routeState.language ?? [],
                        collection: routeState.collection ?? [],
                    },
                },
            };
        },
    },
};
const searchClient = algoliasearch(
    'ZLPYTBTZ4R',
    'be46d26dfdb299f9bee9146b63c99c77'
);


const SearchApp: FC = () => {
    const [savedHits, setSavedHits] = useState<RecordHit[]>([]);
    const [listOpen, setListOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('singerman_bookmarks');
        if (saved) setSavedHits(JSON.parse(saved));
    }, []);
    const toggleSave = (hit: RecordHit) => {
        // Check for hit.id OR hit.objectID depending on your data
        const identifier = hit.slug || hit.slug;

        if (!identifier) {
            console.error("No identifier found for this hit:", hit);
            return;
        }

        const isAlreadySaved = savedHits.some(s => (s.slug || s.slug) === identifier);

        const newSaved = isAlreadySaved
            ? savedHits.filter(s => (s.slug || s.slug) !== identifier)
            : [...savedHits, hit];

        setSavedHits(newSaved);
        localStorage.setItem('singerman_bookmarks', JSON.stringify(newSaved));
    };


    return (
        <InstantSearch indexName={indexName} searchClient={searchClient} routing={routing}>
            <Configure hitsPerPage={12} />
            <div className="flex justify-end px-4">
                <Button
                    onClick={() => setListOpen(true)}
                    startIcon={<BookmarkAddIcon />}
                    sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}
                    variant="contained"
                    color="secondary"
                >
                    My Research List ({savedHits.length})
                </Button>
            </div>
            <div className="mx-auto max-w-7xl px-4">
                {/* Top bar */}
                <div className="sticky top-0 z-40 bg-gray-50/80 backdrop-blur-md py-4 border-b border-gray-200 -mx-4 px-4 mb-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                        <div className="flex-1">
                            <SearchBox
                                placeholder="Search titles, authors, or Singerman ID..."
                                searchAsYouType
                                classNames={{
                                    root: "group",
                                    form: "relative",
                                    input: "block w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 rounded-lg shadow-sm transition-all",
                                    submitIcon: "absolute top-3 left-3 w-4 h-4 fill-slate-400 group-focus-within:fill-blue-600 transition-colors",
                                    resetIcon: "hidden",
                                }}
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <Stats
                                translations={{
                                    rootElementText({ nbHits, processingTimeMS }) {
                                        return `${nbHits.toLocaleString()} records found`;
                                    },
                                }}
                                classNames={{
                                    text: "text-xs font-medium text-slate-500 uppercase tracking-wider font-[Karla]"
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(true)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-blue-300 transition-all"
                            >
                               {/* You can import a simple SVG here */}
                                Filters
                            </button>
                        </div>
                    </div>
                </div>
                {/* Chips + controls */}
                <CurrentRefinements
                    classNames={{
                        root: "flex flex-wrap gap-2 mt-3",
                        list: "flex flex-wrap gap-2",
                        item:
                            "bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300 flex items-center",
                        label: "font-semibold mr-1",
                        delete: "ml-1 text-blue-400 hover:text-blue-700 focus:outline-none cursor-pointer",
                    }}
                />

                <div className="flex items-center justify-between mb-4 mt-2">
                    <Stats />
                    <HitsPerPage
                        items={[
                            { label: "12 hits per page", value: 12, default: true },
                            { label: "50 hits per page", value: 50 },
                            { label: "100 hits per page", value: 100 },
                        ]}
                    />
                </div>

                {/* Results */}
                <Hits
                    classNames={{
                        root: "mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm",
                        list: "divide-y divide-gray-100",
                        emptyRoot: "p-12 text-center bg-white border border-dashed border-gray-300 rounded-xl"
                    }}
                    // Use the hitComponent prop with an arrow function to pass extra props
                    hitComponent={({ hit }) => ( // Destructure hit here
                        <HitListItem
                            hit={hit}
                            onSave={toggleSave}
                            isSaved={savedHits.some(s => (s.slug || s.slug) === (hit.slug || hit.objectID))}
                        />
                    )}
                />

                <Pagination
                    classNames={{
                        root: "flex justify-center items-center gap-2 mt-6",
                        list: "flex flex-row gap-2",
                        item: "inline-block",
                        link: `px-3 py-1 rounded-md font-medium text-base transition-colors
              hover:underline hover:text-blue-700 dark:hover:text-blue-300
              aria-current:underline aria-current:text-blue-700 aria-current:dark:text-blue-300`,
                        selectedItem: "font-bold underline text-blue-700 dark:text-blue-300",
                        disabledItem: "opacity-50 cursor-not-allowed",
                    }}
                />
            </div>
            {/* DRAWER 1: Filters (Keep this separate) */}
            {filtersOpen && (
                <div className="fixed inset-0 z-50">
                    <button className="absolute inset-0 bg-black/30" onClick={() => setFiltersOpen(false)} />
                    <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white p-6 shadow-xl overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold font-[Karla]">Filters</h2>
                            <button onClick={() => setFiltersOpen(false)} className="text-gray-400 hover:text-black">Close</button>
                        </div>
                        <div className="space-y-6">
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Collection</h3>
                                <RefinementList attribute="collection" classNames={{
                                    label: "flex items-center gap-2 py-1 cursor-pointer group",
                                    checkbox: "rounded border-slate-300 text-blue-600 focus:ring-blue-500",
                                    labelText: "text-sm text-slate-600 group-hover:text-slate-900 font-[Karla]",
                                    count: "ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono",
                                    noResults: "text-sm italic text-slate-400 py-2",
                                    showMore: "text-xs font-bold text-blue-600 uppercase tracking-tighter mt-2 hover:text-blue-800"
                                }} searchable={false} showMore={false} />

                                {/* Author */}
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Author/Editor</h3>
                                <RefinementList attribute="author" classNames={{
                                    label: "flex items-center gap-2 py-1 cursor-pointer group",
                                    checkbox: "rounded border-slate-300 text-blue-600 focus:ring-blue-500",
                                    labelText: "text-sm text-slate-600 group-hover:text-slate-900 font-[Karla]",
                                    count: "ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono",
                                    noResults: "text-sm italic text-slate-400 py-2",
                                    showMore: "text-xs font-bold text-blue-600 uppercase tracking-tighter mt-2 hover:text-blue-800",
                                    root: "mb-3",
                                    searchBox: "flex items-center gap-2 py-1 cursor-pointer group",

                                 }} searchable searchablePlaceholder="Search Author/Editor" showMore />

                                {/* Location */}
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Location</h3>
                                <RefinementList attribute="place" classNames={{
                                    label: "flex items-center gap-2 py-1 cursor-pointer group",
                                    checkbox: "rounded border-slate-300 text-blue-600 focus:ring-blue-500",
                                    labelText: "text-sm text-slate-600 group-hover:text-slate-900 font-[Karla]",
                                    count: "ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono",
                                    noResults: "text-sm italic text-slate-400 py-2",
                                    showMore: "text-xs font-bold text-blue-600 uppercase tracking-tighter mt-2 hover:text-blue-800"
                                }} searchable searchablePlaceholder="Search location" showMore />

                                {/* Date range */}
                                <DateRangeSlider
                                    title="Date Range"
                                    dateFields={["startDate", "endDate"]}
                                    minTimestamp={-11676096000}
                                    maxTimestamp={31536000}
                                    // ...your props
                                />

                                {/* Language */}
                                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Language</h3>
                                <RefinementList attribute="language" classNames={{
                                    label: "flex items-center gap-2 py-1 cursor-pointer group",
                                    checkbox: "rounded border-slate-300 text-blue-600 focus:ring-blue-500",
                                    labelText: "text-sm text-slate-600 group-hover:text-slate-900 font-[Karla]",
                                    count: "ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono",
                                    noResults: "text-sm italic text-slate-400 py-2",
                                    showMore: "text-xs font-bold text-blue-600 uppercase tracking-tighter mt-2 hover:text-blue-800"
                                }} searchable={false} showMore={false} />
                    </div>
                </div>
                </div>
            )}
            {/* 2. RESEARCH LIST DRAWER - Moved outside the filter conditional */}
            {listOpen && (
                <div className="fixed inset-0 z-[60]">
                    <button className="absolute inset-0 bg-black/40" onClick={() => setListOpen(false)} />
                    <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl p-6 flex flex-col h-full">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold font-[Spectral]">My Research List</h2>
                            <button onClick={() => setListOpen(false)} className="text-gray-500 hover:text-black text-2xl">✕</button>
                        </div>

                        {savedHits.length === 0 ? (
                            <div className="text-center py-20 text-gray-400 italic">
                                No items saved to your bibliography yet.
                            </div>
                        ) : (
                            <div className="flex flex-col h-full overflow-hidden">
                                <Button
                                    fullWidth
                                    variant="contained"
                                    sx={{ mb: 4, py: 1.5, fontWeight: 700, borderRadius: 2 }}
                                    onClick={() => exportToRIS(savedHits)}
                                >
                                    Export {savedHits.length} {savedHits.length === 1 ? 'Item' : 'Items'} to RIS
                                </Button>

                                {savedHits.map((hit) => (
                                    <div
                                        key={hit.slug}
                                        className="py-5 flex gap-4 items-start group border-b border-gray-100 last:border-0 hover:bg-slate-50/50 transition-colors px-2 -mx-2 rounded-lg"
                                    >
                                        {/* 1. ID Indicator - Subtle & Small */}
                                        <div className="flex-shrink-0 w-12 pt-0.5">
                                            <span className="text-[10px] font-black font-[Karla] text-slate-400 block leading-none mb-1">ID</span>
                                            <span className="text-xs font-bold font-[Karla] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {hit.slug}
            </span>
                                        </div>

                                        {/* 2. Bibliographic Details */}
                                        <div className="flex-grow min-w-0">
                                            <h4 className="font-bold text-[15px] font-[Spectral] text-slate-900 leading-snug mb-1 group-hover:text-blue-800 transition-colors">
                                                {hit.title}
                                            </h4>

                                            <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-[Karla] text-slate-500">
                <span className="font-semibold text-slate-700">
                    {hit.author || hit.contributor || 'Anonymous'}
                </span>
                                                {hit.year && (
                                                    <>
                                                        <span className="text-slate-300">•</span>
                                                        <span>{hit.year}</span>
                                                    </>
                                                )}
                                                {hit.place && (
                                                    <>
                                                        <span className="text-slate-300">•</span>
                                                        <span className="italic">{hit.place}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* 3. Actions */}
                                        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => toggleSave(hit)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                                title="Remove from list"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <div className="mt-6 pt-4 border-t border-gray-100">
                                    <p className="text-xs text-gray-400 mb-4 text-center">
                                        Tip: RIS files can be imported directly into Zotero, EndNote, and Mendeley.
                                    </p>
                                    <Button
                                        fullWidth
                                        color="error"
                                        size="small"
                                        onClick={() => {
                                            setSavedHits([]);
                                            localStorage.removeItem('singerman_bookmarks');
                                        }}
                                    >
                                        Clear Entire List
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </InstantSearch>
    );
};

export default SearchApp;