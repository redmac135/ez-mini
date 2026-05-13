import { buildHabitProgress, getCompletionScore } from './recurrence';
import type { Completion, Habit } from './types';

export interface CalendarDay {
	dateKey: string;
	day: number;
	score: number;
	isToday: boolean;
	isSelected: boolean;
}

export interface CalendarMonth {
	key: string;
	year: number;
	month: number;
	label: string;
	leadingBlanks: number;
	days: CalendarDay[];
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, { month: 'long' });

export function getMonthKey(dateKey: string) {
	return dateKey.slice(0, 7);
}

export function addMonths(monthKey: string, delta: number) {
	const [year, month] = parseMonthKey(monthKey);
	const date = new Date(year, month - 1 + delta, 1);
	return toMonthKey(date.getFullYear(), date.getMonth() + 1);
}

export function getInitialCalendarMonthKeys(todayDateKey: string, radius = 6) {
	const currentMonthKey = getMonthKey(todayDateKey);
	const months: string[] = [];
	for (let offset = -radius; offset <= radius; offset += 1) {
		months.push(addMonths(currentMonthKey, offset));
	}
	return months;
}

export function prependCalendarMonthKeys(monthKeys: string[], count = 6) {
	const first = monthKeys[0];
	if (!first) {
		return monthKeys;
	}

	const added: string[] = [];
	for (let offset = count; offset >= 1; offset -= 1) {
		added.push(addMonths(first, -offset));
	}
	return [...added, ...monthKeys];
}

export function appendCalendarMonthKeys(monthKeys: string[], count = 6) {
	const last = monthKeys.at(-1);
	if (!last) {
		return monthKeys;
	}

	const added: string[] = [];
	for (let offset = 1; offset <= count; offset += 1) {
		added.push(addMonths(last, offset));
	}
	return [...monthKeys, ...added];
}

export function buildCalendarMonth(
	monthKey: string,
	habits: Habit[],
	completions: Completion[],
	todayDateKey: string,
	selectedDateKey: string
): CalendarMonth {
	const [year, month] = parseMonthKey(monthKey);
	const firstDate = new Date(year, month - 1, 1);
	const daysInMonth = new Date(year, month, 0).getDate();
	const days: CalendarDay[] = [];

	for (let day = 1; day <= daysInMonth; day += 1) {
		const dateKey = `${monthKey}-${`${day}`.padStart(2, '0')}`;
		days.push({
			dateKey,
			day,
			score: getCalendarDayScore(habits, completions, dateKey),
			isToday: dateKey === todayDateKey,
			isSelected: dateKey === selectedDateKey
		});
	}

	return {
		key: monthKey,
		year,
		month,
		label: MONTH_LABEL_FORMATTER.format(firstDate),
		leadingBlanks: firstDate.getDay(),
		days
	};
}

export function getCalendarDayScore(habits: Habit[], completions: Completion[], dateKey: string) {
	return getCompletionScore(buildHabitProgress(habits, completions, dateKey));
}

function parseMonthKey(monthKey: string): [number, number] {
	const [year, month] = monthKey.split('-').map(Number);
	if (!year || !month || month < 1 || month > 12) {
		throw new Error(`Invalid month key: ${monthKey}`);
	}
	return [year, month];
}

function toMonthKey(year: number, month: number) {
	return `${year}-${`${month}`.padStart(2, '0')}`;
}
