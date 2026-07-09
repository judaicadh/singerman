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

## Project structure

```
src/
├── components/   React search islands (Search, HitCard, refinements, date slider, ...)
├── data/         items.json — the generated dataset
├── layouts/      BaseLayout.astro
├── pages/        Routes — index, search, entry/author/contributor/holding/[slug],
│                 about pages, and reference markdown (abbreviations, library symbols)
├── styles/       Global styles
└── utils/        pushToAlgolia.mjs, slugify.js
csv-to-json/      Source CSVs and the CSV→JSON conversion script
```
