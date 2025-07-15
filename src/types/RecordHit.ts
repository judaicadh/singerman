import type { Hit as AlgoliaHit } from 'instantsearch.js';

export interface Record {
    id: string;
    slug: string;
    title: string;
    startDate?: number | null;
    endDate?: number | null;
    alternateTitles: string[];
    creator?: string;
    creatorUri?: string;
    contributor?: string[];
    year?: string;
    description?: string;
    language?: string[];
    languageUri?: string;
    place?: string;
    placeUri?: string;
    kind?: string;
    type?: string;
    formatLinks?: string[];
    archiveOrgId?: string;
    internetArchive?: string;
    hathiTrust?: string;
    googleBooks?: string;
    worldcat?: string;
    digitalLinks: {
        archive?: string;
        hathi?: string;
        google?: string;
        worldcat?: string;
        other?: string;
    };
    isDigitized: boolean;
    viaf?: string;
    shelfmark?: string;
    collection?: string;
    goldmanTitle?: string;
    goldmanId?: string;
    locationNote?: string;
    latLng?: { lat: number; lng: number } | null;
    gettyId?: string;
    thumbnail?: string;
    tags: string[];
    url?: string;
}


export type RecordHit = AlgoliaHit<Record>;