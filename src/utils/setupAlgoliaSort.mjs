import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { algoliasearch } from 'algoliasearch';

// ─── Resolve __dirname & load .env ──────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });

const { ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY } = process.env;
if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY) {
    console.error('⚠️  Missing ALGOLIA_APP_ID or ALGOLIA_ADMIN_KEY in .env');
    process.exit(1);
}

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);

const PRIMARY = 'dev_Singerman';
const ASC = `${PRIMARY}_year_asc`;
const DESC = `${PRIMARY}_year_desc`;

/*
 * Standard replicas give a strict chronological order. Each replica inherits
 * the primary's settings; we only override `ranking` so `startDate` dominates
 * (undated records fall back to the primary's textual ranking, then to the
 * bottom). Run once after the primary index exists:  node src/utils/setupAlgoliaSort.mjs
 */
async function run() {
    // 1. Attach the replicas to the primary index.
    await client.setSettings({
        indexName: PRIMARY,
        indexSettings: { replicas: [ASC, DESC] },
    });
    console.log(`✅ Registered replicas on ${PRIMARY}: ${ASC}, ${DESC}`);

    // 2. Give each replica a ranking that sorts by year.
    const baseRanking = ['typo', 'geo', 'words', 'filters', 'proximity', 'attribute', 'exact', 'custom'];

    await client.setSettings({
        indexName: ASC,
        indexSettings: { ranking: ['asc(startDate)', ...baseRanking] },
    });
    console.log(`✅ ${ASC} → sort by startDate ascending (oldest first)`);

    await client.setSettings({
        indexName: DESC,
        indexSettings: { ranking: ['desc(startDate)', ...baseRanking] },
    });
    console.log(`✅ ${DESC} → sort by startDate descending (newest first)`);

    console.log('\n🎉 Done. The SortBy widget can now switch between these indices.');
}

run().catch((e) => {
    console.error('❌ Error configuring sort replicas:', e.message, e.stack);
    process.exit(1);
});
