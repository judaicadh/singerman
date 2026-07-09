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
// Theme tokens (see global.css) so MUI buttons flip with light/dark.
const SCHOLAR_RED = 'var(--red)';
const SCHOLAR_BLACK = 'var(--btn-bg)';
const SCHOLAR_BLACK_HOVER = 'var(--btn-bg-hover)';
const SCHOLAR_PAPER = 'var(--paper)';
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

            {/* Research List Button: Styled in Scholar Black */}
            <div className="flex justify-end px-4">
                <Button
                    onClick={() => setListOpen(true)}
                    startIcon={<BookmarkAddIcon />}
                    sx={{
                        position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
                        bgcolor: SCHOLAR_BLACK,
                        borderRadius: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        fontSize: '0.75rem',
                        fontWeight: 900,
                        '&:hover': { bgcolor: SCHOLAR_RED }
                    }}
                    variant="contained"
                >
                    Research List ({savedHits.length})
                </Button>
            </div>

            <div className="mx-auto max-w-7xl px-4">
                {/* Sticky Header: Parchment backdrop with Red bottom border */}
                <div className="bg-[#FCFAf7] dark:bg-[#121212] py-8 border-b-4 border-[#b91c1c] -mx-4 px-4 mb-10">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                        <div className="flex-1">
                            <SearchBox
                                placeholder="Search by Title, Author, or Singerman ID..."
                                searchAsYouType
                                classNames={{
                                    root: "group",
                                    form: "relative",
                                    // Removed blue rings, replaced with Scholar Black border
                                    input: "block w-full pl-12 pr-4 py-3 bg-white dark:bg-[#1e1e1e] border-2 border-gray-200 dark:border-gray-700 text-[#1a1a1a] dark:text-[#e5e5e5] placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-[#1a1a1a] dark:focus:border-[#ff4d4d] rounded-lg shadow-sm transition-all font-serif italic text-lg",
                                    submitIcon: "absolute top-4 left-4 w-5 h-5 fill-gray-400 group-focus-within:fill-[#b91c1c] transition-colors",
                                    resetIcon: "hidden",
                                }}
                            />
                        </div>

                        <div className="flex items-center gap-4">
                            <Stats
                                translations={{
                                    rootElementText({ nbHits }) {
                                        return `${nbHits.toLocaleString()} records found`;
                                    },
                                }}
                                classNames={{
                                    text: "text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] font-[Karla]"
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(true)}
                                className="inline-flex items-center gap-2 rounded-lg border-2 border-[#1a1a1a] dark:border-gray-600 bg-white dark:bg-[#1e1e1e] px-5 py-2.5 text-xs font-black text-[#1a1a1a] dark:text-[#e5e5e5] uppercase tracking-widest hover:bg-[#b91c1c] hover:text-white hover:border-[#b91c1c] dark:hover:bg-[#ff4d4d] dark:hover:border-[#ff4d4d] transition-all shadow-sm"
                            >
                                Filter Archive
                            </button>
                        </div>
                    </div>
                </div>

                {/* Refinement Chips: Red/Parchment style */}
                <CurrentRefinements
                    classNames={{
                        root: "flex flex-wrap gap-2 mb-6",
                        list: "flex flex-wrap gap-2",
                        item: "bg-white dark:bg-[#1e1e1e] border border-[#b91c1c] dark:border-[#ff4d4d] text-[#b91c1c] dark:text-[#ff4d4d] text-[11px] font-black uppercase tracking-tighter px-3 py-1 rounded flex items-center shadow-sm",
                        label: "mr-1 opacity-60",
                        delete: "ml-2 hover:text-black dark:hover:text-white cursor-pointer",
                    }}
                />

                {/* Results: Removed blue highlight, using the custom HitCard spine effect */}
                <Hits
                    classNames={{
                        root: "bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm",
                        list: "divide-y divide-gray-100 dark:divide-gray-800",
                        emptyRoot: "p-20 text-center bg-white dark:bg-[#1e1e1e] border border-dashed border-gray-300 dark:border-gray-700 rounded-xl font-serif italic text-gray-400"
                    }}
                    hitComponent={({ hit }) => (
                        <HitListItem
                            hit={hit}
                            onSave={toggleSave}
                            isSaved={savedHits.some(s => (s.slug || s.slug) === (hit.slug || hit.objectID))}
                        />
                    )}
                />

                {/* Pagination: Scholarly red underlined style */}
                <Pagination
                    classNames={{
                        root: "flex justify-center items-center gap-2 mt-12 pb-12",
                        list: "flex flex-row gap-4",
                        link: "text-sm font-black uppercase tracking-widest text-gray-400 hover:text-[#b91c1c] transition-colors",
                        selectedItem: "text-[#b91c1c] border-b-2 border-[#b91c1c]",
                        disabledItem: "opacity-20",
                    }}
                />
            </div>

            {/* DRAWER: Filters - Updated with Scholar Red accents */}
            {/* DRAWER: Filters - Mobile Optimized */}
            <div
                className={`fixed inset-0 z-50 transition-all duration-300 ${
                    filtersOpen ? 'visible opacity-100' : 'invisible opacity-0'
                }`}
            >
                {/* Backdrop */}
                <button
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={() => setFiltersOpen(false)}
                />

                <div
                    className={`absolute right-0 top-0 h-full w-full md:max-w-md bg-[#FCFAf7] dark:bg-[#121212] p-6 md:p-8 shadow-2xl overflow-y-auto border-l-0 md:border-l-8 border-[#b91c1c] transition-transform duration-300 transform ${
                        filtersOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
                >
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl md:text-2xl font-serif font-bold">Search Filters</h2>
                        <button
                            onClick={() => setFiltersOpen(false)}
                            className="p-2 -mr-2 text-gray-400 hover:text-black"
                        >
                            <span className="text-[10px] font-black uppercase tracking-widest">Close ✕</span>
                        </button>
                    </div>
                    <div className="space-y-6">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Collection</h3>
                        <RefinementList attribute="collection" classNames={{
                            label: "flex items-center gap-3 py-2 cursor-pointer group", // Slightly larger hit area for fingers
                            checkbox: "w-5 h-5 border-2 border-gray-300 text-[#b91c1c] focus:ring-[#b91c1c] rounded-sm", // Bigger checkbox
                            labelText: "text-base md:text-sm font-serif text-gray-700 dark:text-gray-300", // Larger text for mobile
                            count: "ml-auto text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded",
                            searchBox: "mb-4",
                        }} searchable={false} showMore={false} />

                        {/* Author */}
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#b91c1c] mb-4 border-b pb-2">
                            Author/Editor
                        </h3>
                        <RefinementList attribute="author" classNames={{
                            label: "flex items-center gap-3 py-2 cursor-pointer group", // Slightly larger hit area for fingers
                            checkbox: "w-5 h-5 border-2 border-gray-300 text-[#b91c1c] focus:ring-[#b91c1c] rounded-sm", // Bigger checkbox
                            labelText: "text-base md:text-sm font-serif text-gray-700 dark:text-gray-300", // Larger text for mobile
                            count: "ml-auto text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded",
                            searchBox: "mb-4",

                        }} searchable searchablePlaceholder="Search Author/Editor" showMore />
                        {/* Author */}
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#b91c1c] mb-4 border-b pb-2">
                            Printer/Publisher
                        </h3>
                        <RefinementList attribute="contributor" classNames={{
                            label: "flex items-center gap-3 py-2 cursor-pointer group", // Slightly larger hit area for fingers
                            checkbox: "w-5 h-5 border-2 border-gray-300 text-[#b91c1c] focus:ring-[#b91c1c] rounded-sm", // Bigger checkbox
                            labelText: "text-base md:text-sm font-serif text-gray-700 dark:text-gray-300", // Larger text for mobile
                            count: "ml-auto text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded",
                            searchBox: "mb-4",

                        }} searchable searchablePlaceholder="Search Printer/Publisher" showMore />
                        {/* Date */}
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#b91c1c] mb-4 border-b pb-2">
                            Date
                        </h3>
                        <DateRangeSlider
                            title="Date Range"
                            dateFields={["startDate", "endDate"]}
                            minTimestamp={-11676096000}
                            maxTimestamp={31536000}
                            // ...your props
                        />
                        {/* Location */}
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#b91c1c] mb-4 border-b pb-2">
                            Location
                        </h3>
                        <RefinementList attribute="place" classNames={{
                            label: "flex items-center gap-3 py-2 cursor-pointer group", // Slightly larger hit area for fingers
                            checkbox: "w-5 h-5 border-2 border-gray-300 text-[#b91c1c] focus:ring-[#b91c1c] rounded-sm", // Bigger checkbox
                            labelText: "text-base md:text-sm font-serif text-gray-700 dark:text-gray-300", // Larger text for mobile
                            count: "ml-auto text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded",
                            searchBox: "mb-4",
                        }} searchable searchablePlaceholder="Search location" showMore />



                        {/* Language */}
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#b91c1c] mb-4 border-b pb-2">
                            Language
                        </h3>
                        <RefinementList attribute="language" classNames={{
                            label: "flex items-center gap-3 py-2 cursor-pointer group", // Slightly larger hit area for fingers
                            checkbox: "w-5 h-5 border-2 border-gray-300 text-[#b91c1c] focus:ring-[#b91c1c] rounded-sm", // Bigger checkbox
                            labelText: "text-base md:text-sm font-serif text-gray-700 dark:text-gray-300", // Larger text for mobile
                            count: "ml-auto text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded",
                            searchBox: "mb-4",
                        }} searchable={false} showMore={false} />
                    </div>




                    </div>

                </div>

            {/* 2. RESEARCH LIST DRAWER - Moved outside the filter conditional */}
            {listOpen && (
                <div className="fixed inset-0 z-[1001] flex justify-end"> {/* High z-index */}
                    <button
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setListOpen(false)}
                    />

                    <div className="relative h-full w-full sm:max-w-md md:max-w-lg bg-[#FCFAf7] dark:bg-[#121212] shadow-2xl flex flex-col border-t-8 sm:border-t-0 sm:border-l-8 border-[#b91c1c] transition-transform duration-300">

                        {/* Drawer Header */}
                        <div className="p-4 md:p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e1e1e] flex items-center justify-between">
                            <div>
                                <h2 className="text-lg md:text-xl font-serif font-bold text-black dark:text-white">My Research List</h2>
                                <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">
                                    {savedHits.length} {savedHits.length === 1 ? 'Record' : 'Records'} Collected
                                </p>
                            </div>
                            <button onClick={() => setListOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <span className="text-xs md:text-sm font-black uppercase tracking-widest text-gray-400 hover:text-black">Close ✕</span>
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-4">
                            {savedHits.length === 0 ? (
                                <div className="text-center py-20">
                                    <BookmarkAddIcon sx={{ fontSize: 48, color: '#e5e7eb', mb: 2 }} />
                                    <p className="text-gray-400 italic font-serif">Your bibliography is currently empty.</p>
                                </div>
                            ) : (
                                savedHits.map((hit) => (
                                    <div key={hit.slug} className="group bg-white dark:bg-[#1e1e1e] p-4 rounded border border-gray-200 dark:border-gray-800 shadow-sm hover:border-[#b91c1c] dark:hover:border-[#ff4d4d] transition-all relative flex flex-col">
                                        {/* Hit Badge & Delete */}
                                        <div className="flex justify-between items-start mb-3">
                                <span className="text-[10px] font-mono font-bold text-[#b91c1c] dark:text-[#ff4d4d] bg-red-50 dark:bg-[#2a1414] px-2 py-0.5 rounded border border-red-100 dark:border-[#5a2020]">
                                    #{hit.id || hit.slug}
                                </span>
                                            <button
                                                onClick={() => toggleSave(hit)}
                                                className="p-1 text-gray-300 hover:text-red-600 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                                                title="Remove from list"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>

                                        <h4 className="font-serif italic text-base leading-snug text-gray-900 dark:text-gray-100 mb-2">{hit.title}</h4>

                                        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex flex-wrap gap-x-2 mb-4">
                                            <span className="text-gray-700 dark:text-gray-300">{hit.author || hit.contributor || 'Anonymous'}</span>
                                            {hit.year && <span>• {hit.year}</span>}
                                            {hit.place && <span className="italic">• {hit.place}</span>}
                                        </div>

                                        {/* View Entry Button */}
                                        <a
                                            href={`/entry/${hit.slug}`}
                                            className="w-full text-center py-2 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300 hover:bg-[#b91c1c] hover:text-white hover:border-[#b91c1c] dark:hover:bg-[#ff4d4d] dark:hover:border-[#ff4d4d] transition-all"
                                        >
                                            View Full Entry
                                        </a>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer Actions */}
                        {/* Fixed Footer: Clean separation for Export RIS */}
                        <div className="p-4 md:p-6 bg-white dark:bg-[#1e1e1e] border-t border-gray-200 dark:border-gray-800 sticky bottom-0">
                            <Button
                                fullWidth
                                variant="contained"
                                onClick={() => exportToRIS(savedHits)}
                                disabled={savedHits.length === 0}
                                sx={{
                                    bgcolor: SCHOLAR_BLACK,
                                    fontWeight: 900,
                                    letterSpacing: '0.1em',
                                    py: 2,
                                    borderRadius: '6px',
                                    '&:hover': { bgcolor: SCHOLAR_RED }
                                }}
                            >
                                Export RIS
                            </Button>
                            <button
                                onClick={() => { setSavedHits([]); localStorage.removeItem('singerman_bookmarks'); }}
                                className="w-full text-center mt-4 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-red-600 transition-colors"
                            >
                                Clear Entire List
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </InstantSearch>
    );
};

export default SearchApp;