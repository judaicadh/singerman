import csv from 'csvtojson';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const csvFilePath = path.join(__dirname, './Singerman-Jan2024 (37).csv');
const jsonFilePath = path.join(__dirname, '../src/data/items.json');

// Helpers
const parsePipeField = (value) =>
	value ? value.split(' | ').map(v => v.trim()).filter(Boolean) : [];

const parseMultiFields = (item, baseField, count = 20) => {
	const values = [];
	for (let i = 0; i < count; i++) {
		const field = i === 0 ? baseField : `${baseField} ${i}`;
		if (item[field]) {
			const split = item[field].split('|').map(v => v.trim()).filter(Boolean);
			values.push(...split);
		}
	}
	return values.filter(Boolean);
};

const isValidTimestamp = (timestamp) => {
	const minTimestamp = Math.floor(new Date("1300-01-01T00:00:00Z").getTime() / 1000);
	const maxTimestamp = Math.floor(Date.now() / 1000);
	return timestamp >= minTimestamp && timestamp <= maxTimestamp;
};

async function main() {
	try {
		const jsonArray = await csv({ separator: ',' }).fromFile(csvFilePath);

		const formattedData = jsonArray.map((item, index) => {
			const titles = parseMultiFields(item, 'dcterms:title', 3);
			const contributors = parseMultiFields(item, 'dcterms:contributor', 5);
			const languages = parsePipeField(item['dcterms:language']);

			// Parse date field containing Unix timestamps separated by "|"
			const dateParts = (item['Date'] || '')
				.split('|')
				.map((d) => d.trim())
				.filter(Boolean);

			const startDateRaw = parseInt(dateParts[0], 10);
			const endDateRaw = parseInt(dateParts[1] || dateParts[0], 10);

			const startDate = isValidTimestamp(startDateRaw) ? startDateRaw : null;
			const endDate = isValidTimestamp(endDateRaw) ? endDateRaw : null;

			const lat = parseFloat(item['latitude']);
			const lng = parseFloat(item['longitude']);

			return {
				id: item['dcterms:identifier'] || `record-${index}`,
				slug:
					item['slug'] ||
					(titles[0] || item['dcterms:identifier'] || `record-${index}`)
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/(^-|-$)/g, ''),
				title: titles[0] || '',
				alternateTitles: titles.slice(1),
				creator: item['dcterms:creator'] || '',
				creatorUri: item['dcterms:creator ^^uri'] || '',
				contributor: contributors,
				year: item['dcterms:created'] || '',
				startDate,
				endDate,
				description: item['dcterms:description'] || item['Description'] || '',
				language: languages,
				languageUri: item['dcterms:language uri'] || '',
				place: item['dcterms:spatial'] || '',
				placeUri: item['dcterms:spatial ^^uri'] || '',
				kind: item['Kind'] || '',
				type: item['Type'] || '',
				formatLinks: parseMultiFields(item, 'dcterms:hasFormat', 3),
				archiveOrgId: item['archive.org id'] || '',
				internetArchive: item['Internet Archive'] || '',
				hathiTrust: item['HathiTrust'] || '',
				googleBooks: item['Google Books'] || '',
				worldcat: item['WorldCat'] || '',
				digitalLinks: Object.fromEntries(
					Object.entries({
						archive: item['Internet Archive'],
						hathi: item['HathiTrust'],
						google: item['Google Books'],
						worldcat: item['WorldCat'],
						other: item['Other Digital'],
					}).filter(([_, v]) => v)
				),
				isDigitized: Boolean(
					item['Internet Archive'] ||
					item['HathiTrust'] ||
					item['Google Books'] ||
					item['Other Digital']
				),
				viaf: item['VIAF ID'] || '',
				shelfmark: item['Penn Shelfmark'] || '',
				collection: item['dcterms:isPartOf'] || '',
				goldmanTitle: item['Title (Goldman-Kinsberg)'] || '',
				goldmanId: item['Goldman-Kinsberg ID'] || '',
				locationNote: item['sdo:itemLocation'] || '',
				latLng: (!isNaN(lat) && !isNaN(lng)) ? { lat, lng } : null,
				gettyId: item['Getty Thesaurus of Geographic Names ID'] || '',
				thumbnail: item['thumbnail'] || '',
				tags: parsePipeField(item['tags']),
			};
		});

		await fs.mkdir(path.dirname(jsonFilePath), { recursive: true });
		await fs.writeFile(jsonFilePath, JSON.stringify(formattedData, null, 2), 'utf-8');
		console.log('✅ Singerman CSV to JSON conversion completed.');
	} catch (err) {
		console.error('❌ Error converting Singerman CSV to JSON:', err);
	}
}

main();