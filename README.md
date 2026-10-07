# Robert Singerman's _Judaica Americana II_

A searchable bibliographical database of Robert Singerman's _Judaica Americana II_ — an
authoritative chronicle of American Jewish book and serial production from the seventeenth
through the twentieth century, expanded with roughly 3,000 additional entries (nearly 10,000
records in total).

Live site: <https://singerman.judaicadhpenn.org>

## Tech stack

- **[Astro](https://astro.build/)** — static site generation with dynamic entry, author,
  contributor, and holding pages
- **[React](https://react.dev/)** islands for the interactive search UI
- **[Algolia](https://www.algolia.com/)** (`react-instantsearch`) — full-text search,
  faceting, and date-range filtering
- **[Tailwind CSS](https://tailwindcss.com/)** v4 for styling
- **[Netlify](https://www.netlify.com/)** for hosting (via `@astrojs/netlify`)

## Getting started

```bash
npm install
npm run dev      # start the dev server at http://localhost:4321
```

### Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the local dev server           |
| `npm run build`   | Build the production site to `dist/` |
| `npm run preview` | Preview the production build locally |

## Environment variables

Search and indexing require Algolia credentials in a `.env` file at the project root:

```
ALGOLIA_APP_ID=your-app-id
ALGOLIA_ADMIN_KEY=your-admin-key
```

The `ALGOLIA_ADMIN_KEY` is only used by the indexing script and must never be exposed to the
browser; the client-side search UI uses a separate search-only API key.

## Data pipeline

Bibliographic records originate as CSV exports and flow into the site in two steps:

1. **CSV → JSON** — `csv-to-json/convertCsvToJson.mjs` parses the source CSV
   (`csv-to-json/Singerman-*.csv`) into `src/data/items.json`, normalizing pipe-delimited
   fields and date ranges.
2. **JSON → Algolia** — `src/utils/pushToAlgolia.mjs` reads `src/data/items.json` and pushes
   the records to the Algolia index (`dev_Singerman`), deriving searchable start/end dates
   from each entry's date range.

Run each script with Node:

```bash
node csv-to-json/convertCsvToJson.mjs
node src/utils/pushToAlgolia.mjs
```

## Visualization & record counts

The `/visualize` page is an interactive atlas (map + timeline) of the corpus over time, place,
and language, built from `src/data/items.json` at build time.

**Canonical totals.** _Judaica Americana II_ (JA2, 2020) records **9,703 publications**
(**8,980 monographs** + **735 serials**) published between **1675 and 1901**, including
**299 undated entries**.

**Why the dashboard's numbers differ.** The visualization intentionally shows a subset, so its
counts are lower than the canonical totals. Be aware of these rules when reading it:

- **Geolocated + dated only.** A record appears on the map/timeline only if it has both
  coordinates and a parseable year. Undated entries (~299) and any record without coordinates
  are omitted, since they can't be placed. (The full corpus remains searchable on `/search`.)
- **Withdrawn entries are excluded.** Records whose description is exactly `"Withdrawn"`
  (42 of them) are dropped from the visualization entirely.
- **Counting mode.** By default each title is counted **once, by its first year** — matching a
  standard one-title-one-date tally. A **Count → "Across run"** toggle instead spreads a serial
  across every year it published (useful for seeing serial longevity, but it inflates per-year
  totals).
- **Serials vs. monographs** are distinguished by the **collection** field
  (`Union List of Nineteenth-Century Jewish Serials` = serials), _not_ the id prefix: `S###`
  and `suppS###` ids are serials, but `supp####` ids are supplement monographs.
- **Languages.** Many works are multilingual (e.g. Hebrew + English). Such a work counts toward
  **each** of its languages, so the language legend can sum to more than the imprint total. A
  **"Multiple languages only"** filter isolates works in more than one language.

The same `multilingual` filter exists on `/search` as a facet. It relies on a boolean
`multilingual` attribute written by `pushToAlgolia.mjs`; after re-running that script, add
`multilingual` to the index's **attributesForFaceting** in Algolia for the toggle to work.

## Project structure

```
src/
├── components/   React islands (Search, HitCard, refinements, DateRangeSlider,
│                 Dashboard — the /visualize map + timeline, ...)
├── data/         items.json — the generated dataset
├── layouts/      BaseLayout.astro
├── pages/        Routes — index, search, visualize, entry/author/contributor/holding/[slug],
│                 about pages, and reference markdown (abbreviations, library symbols)
├── styles/       Global styles
└── utils/        pushToAlgolia.mjs, slugify.js
csv-to-json/      Source CSVs and the CSV→JSON conversion script
```
