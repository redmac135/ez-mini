import type { Weekday } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getTodayDateKey(now = new Date()) {
	return toDateKey(now);
}

export function toDateKey(date: Date) {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(dateKey: string) {
	const [year, month, day] = dateKey.split('-').map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export function createTimestampForDate(dateKey: string) {
	return `${dateKey}T00:00:00.000Z`;
}

export function timestampToDateKey(timestamp: string | null) {
	return timestamp ? timestamp.slice(0, 10) : null;
}

export function addDays(dateKey: string, count: number) {
	return toDateKey(new Date(parseDateKey(dateKey).getTime() + count * DAY_MS));
}

export function addMonthsClamped(dateKey: string, count: number, dayOfMonth?: number) {
	const source = parseDateKey(dateKey);
	const target = new Date(source.getFullYear(), source.getMonth() + count, 1);
	const day = Math.min(
		dayOfMonth ?? source.getDate(),
		daysInMonth(target.getFullYear(), target.getMonth())
	);
	target.setDate(day);
	return toDateKey(target);
}

export function addYearsClamped(
	dateKey: string,
	count: number,
	month?: number,
	dayOfMonth?: number
) {
	const source = parseDateKey(dateKey);
	const targetMonth = month === undefined ? source.getMonth() : month - 1;
	const target = new Date(source.getFullYear() + count, targetMonth, 1);
	const day = Math.min(
		dayOfMonth ?? source.getDate(),
		daysInMonth(target.getFullYear(), targetMonth)
	);
	target.setDate(day);
	return toDateKey(target);
}

export function getOrdinalWeekdayDate(
	year: number,
	month: number,
	weekOfMonth: number,
	dayOfWeek: Weekday
) {
	const monthIndex = month - 1;
	if (weekOfMonth < 0) {
		const last = new Date(year, monthIndex + 1, 0);
		const diff = (last.getDay() - dayOfWeek + 7) % 7;
		return toDateKey(new Date(year, monthIndex, last.getDate() - diff));
	}

	const first = new Date(year, monthIndex, 1);
	const diff = (dayOfWeek - first.getDay() + 7) % 7;
	return toDateKey(new Date(year, monthIndex, 1 + diff + (weekOfMonth - 1) * 7));
}

export function nextWeekdayDate(fromDateKey: string, days: Weekday[], interval = 1) {
	const start = parseDateKey(fromDateKey);
	const sortedDays = [...new Set(days)].sort((left, right) => left - right);
	for (let offset = 1; offset <= Math.max(1, interval) * 7; offset += 1) {
		const candidate = new Date(start.getTime() + offset * DAY_MS);
		if (sortedDays.includes(candidate.getDay() as Weekday)) {
			return toDateKey(candidate);
		}
	}
	return addDays(fromDateKey, Math.max(1, interval) * 7);
}

function daysInMonth(year: number, monthIndex: number) {
	return new Date(year, monthIndex + 1, 0).getDate();
}

function pad(value: number) {
	return String(value).padStart(2, '0');
}
