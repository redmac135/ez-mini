import type { StoredJourneyEntry } from '../journey';

export function searchJourneyEntries(entries: StoredJourneyEntry[], query: string) {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return [];
	return entries.filter(
		(entry) => !entry.deletedAt && entry.text.toLowerCase().includes(normalizedQuery)
	);
}

export async function loadEntriesThroughDate(
	date: string,
	getOldestDate: () => string | undefined,
	hasMore: () => boolean,
	loadNextPage: () => Promise<void>
) {
	while (hasMore()) {
		const oldest = getOldestDate();
		if (oldest && oldest <= date) return;
		await loadNextPage();
	}
}
