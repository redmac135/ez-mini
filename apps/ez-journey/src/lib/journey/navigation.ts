import type { StoredJourneyEntry } from '../journey';

export function journeyDateKey(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function journeyEntryDateKey(createdAt: string) {
	return journeyDateKey(new Date(createdAt));
}

export function journeyEntryForDate(entries: StoredJourneyEntry[], date: string) {
	return entries
		.filter((entry) => !entry.deletedAt && journeyEntryDateKey(entry.createdAt) === date)
		.sort(
			(left, right) =>
				right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
		)[0];
}

export function nextLocalDayStart(date: string) {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(year, month - 1, day + 1).toISOString();
}

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
	loadNextPage: () => Promise<void>,
	loadAnchor?: (date: string) => Promise<void>
) {
	while (hasMore()) {
		const oldest = getOldestDate();
		if (oldest && oldest <= date) return;
		if (!oldest && loadAnchor) {
			await loadAnchor(date);
			return;
		}
		if (oldest && loadAnchor && dateDistance(oldest, date) > 30) {
			await loadAnchor(date);
			return;
		}
		await loadNextPage();
	}
}

function dateDistance(left: string, right: string) {
	const [leftYear, leftMonth, leftDay] = left.split('-').map(Number);
	const [rightYear, rightMonth, rightDay] = right.split('-').map(Number);
	return Math.abs(
		Date.UTC(leftYear, leftMonth - 1, leftDay) - Date.UTC(rightYear, rightMonth - 1, rightDay)
	) / 86_400_000;
}
