import type { Weekday } from './types';

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getTodayDateKey(now = new Date()) {
	return toDateKey(now);
}

export function toDateKey(date: Date) {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string) {
	const match = DATE_KEY_PATTERN.exec(dateKey);
	if (!match) {
		throw new Error(`Invalid date key: ${dateKey}`);
	}

	return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDays(dateKey: string, days: number) {
	const date = parseDateKey(dateKey);
	date.setDate(date.getDate() + days);
	return toDateKey(date);
}

export function compareDateKeys(left: string, right: string) {
	return left.localeCompare(right);
}

export function getWeekday(dateKey: string): Weekday {
	return parseDateKey(dateKey).getDay() as Weekday;
}

export function startOfWeek(dateKey: string) {
	const date = parseDateKey(dateKey);
	date.setDate(date.getDate() - date.getDay());
	return toDateKey(date);
}

export function daysBetween(startDateKey: string, endDateKey: string) {
	const start = parseDateKey(startDateKey);
	const end = parseDateKey(endDateKey);
	return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function formatDateHeading(dateKey: string, todayDateKey = getTodayDateKey()) {
	const date = parseDateKey(dateKey);
	const formatter = new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});

	if (dateKey === todayDateKey) {
		return `Today, ${formatter.format(date)}`;
	}

	if (dateKey === addDays(todayDateKey, -1)) {
		return `Yesterday, ${formatter.format(date)}`;
	}

	if (dateKey === addDays(todayDateKey, 1)) {
		return `Tomorrow, ${formatter.format(date)}`;
	}

	return formatter.format(date);
}

export function createTimestampForDate(dateKey: string) {
	return `${dateKey}T00:00:00.000`;
}
