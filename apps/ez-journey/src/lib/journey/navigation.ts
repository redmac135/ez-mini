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

export type JourneyCalendarView = 'day' | 'month' | 'year';

export function calendarYearRangeStart(year: number) {
	return Math.floor(year / 12) * 12;
}

export function calendarYears(year: number) {
	const start = calendarYearRangeStart(year);
	return Array.from({ length: 12 }, (_, index) => start + index);
}

export function moveCalendarDate(date: Date, view: JourneyCalendarView, amount: number) {
	if (view === 'day') return new Date(date.getFullYear(), date.getMonth() + amount, 1);
	if (view === 'month') return new Date(date.getFullYear() + amount, date.getMonth(), 1);
	return new Date(calendarYearRangeStart(date.getFullYear()) + amount * 12, date.getMonth(), 1);
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
	options: {
		getOldestDate: () => string | undefined;
		getNewestDate: () => string | undefined;
		hasOlderPage: () => boolean;
		hasNewerPage: () => boolean;
		loadOlderPage: () => Promise<void>;
		loadNewerPage: () => Promise<void>;
		loadAnchor: (date: string) => Promise<void>;
		isCurrent: () => boolean;
	}
) {
	while (options.isCurrent()) {
		const oldest = options.getOldestDate();
		const newest = options.getNewestDate();
		if (oldest && date < oldest) {
			if (!options.hasOlderPage()) return;
			if (dateDistance(oldest, date) > 30) {
				await options.loadAnchor(date);
				return;
			}
			await options.loadOlderPage();
			continue;
		}
		if (!oldest && options.hasOlderPage()) {
			await options.loadAnchor(date);
			return;
		}
		if (newest && date > newest && options.hasNewerPage()) {
			await options.loadNewerPage();
			continue;
		}
		return;
	}
}

function dateDistance(left: string, right: string) {
	const [leftYear, leftMonth, leftDay] = left.split('-').map(Number);
	const [rightYear, rightMonth, rightDay] = right.split('-').map(Number);
	return (
		Math.abs(
			Date.UTC(leftYear, leftMonth - 1, leftDay) - Date.UTC(rightYear, rightMonth - 1, rightDay)
		) / 86_400_000
	);
}
