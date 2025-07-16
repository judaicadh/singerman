import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { algoliasearch } from 'algoliasearch';
import dayjs from 'dayjs';
// ─── 1. Resolve __dirname & load .env ───────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
    path: path.resolve(__dirname, '../..', '.env')
});

// ─── 2. Validate env vars ───────────────────────────────────────────────────────
const { ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY } = process.env;
if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY) {
    console.error('⚠️  Missing ALGOLIA_APP_ID or ALGOLIA_ADMIN_KEY in .env');
    process.exit(1);
}

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);

// ─── 3. File Paths and Settings ─────────────────────────────────────────────────
const siteBaseUrl = 'https://singerman.judaicadhpenn.org/';
const jsonFilePath = path.join(__dirname, '../data/items.json');
const indexName = 'dev_Singerman';
const parseYearRange = (dateStr) => {
    if (!dateStr) return null;
    const match = dateStr.match(/^(\d{4})(?:\D+(\d{4}))?$/);
    if (!match) return null;

    const startYear = parseInt(match[1], 10);
    const endYear = match[2] ? parseInt(match[2], 10) : startYear;

    return {
        startDate: dayjs(`${startYear}-01-01`).unix(),
        endDate: dayjs(`${endYear}-12-31`).unix()
    };
};
// ─── 4. Format for Batch ────────────────────────────────────────────────────────
const formatRecordsForBatch = (records) =>
    records.map((record) => {
        const parsedDates = parseYearRange(record.date);
        return {
            action: 'partialUpdateObject',
            body: {
                objectID: record.id,
                tags: record.tags || [],
                slug: record.slug,
                url: `${siteBaseUrl}entry/${record.id}`,
                startDate: record.startDate,
                endDate: record.endDate,
                year: record.year,
                notes: record.notes,
                description: record.description,
                title: record.title,
                goldmanId: record.goldmanId,
                goldmanTitle: record.goldmanTitle,
                shelfmark: record.shelfmark,
                author: record.authors,
                contributor: record.contributors,
                holdings: record.holdings,
                thumbnail: record.thumbnail,
                collection: record.collection,
                place: record.place,
                iframe: record.iframe,
                language: record.language,
            }
        };
    });

// ─── 5. Push Data to Algolia ────────────────────────────────────────────────────
async function pushDataToAlgolia(records) {
    try {
        const requests = formatRecordsForBatch(records);

        const response = await client.batch({
            indexName,
            batchWriteParams: { requests }
        });

        console.log('✅ Batch update successful:', response);
    } catch (error) {
        console.error('❌ Error during batch update:', error.message, error.stack);
    }
}

// ─── 6. Load and Run ────────────────────────────────────────────────────────────
(async () => {
    try {
        const fileContent = await fs.readFile(jsonFilePath, 'utf-8');
        const records = JSON.parse(fileContent);

        console.log(`📄 Loaded ${records.length} records from JSON`);

        await pushDataToAlgolia(records);
    } catch (error) {
        console.error('❌ Error loading or processing JSON file:', error.message, error.stack);
    }
})();