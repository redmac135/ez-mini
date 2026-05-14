import { createTimestampForDate, getTodayDateKey, parseDateKey, toDateKey } from './dates';
import type { ParsedTaskInput, RepeatRule, Weekday } from './types';

const WEEKDAY_NAMES: Record<string, Weekday> = {
	sun: 0,
	sunday: 0,
	mon: 1,
	monday: 1,
	tue: 2,
	tues: 2,
	tuesday: 2,
	wed: 3,
	wednesday: 3,
	thu: 4,
	thurs: 4,
	thursday: 4,
	fri: 5,
	friday: 5,
	sat: 6,
	saturday: 6
};

export function parseTaskInput(input: string, now = new Date()): ParsedTaskInput {
	let working = normalizeSpaces(input);
	const due = extractDateToken(working, 'due', now);
	if (due) working = removeRange(working, due.start, due.end);
	const planned = extractDateToken(working, 'do', now);
	if (planned) working = removeRange(working, planned.start, planned.end);
	const repeat = extractRepeat(working, now);
	if (repeat) working = removeRange(working, repeat.start, repeat.end);

	return {
		title: working || normalizeSpaces(input) || 'Untitled task',
		dueAt: due ? createTimestampForDate(due.dateKey) : null,
		plannedAt: planned ? createTimestampForDate(planned.dateKey) : null,
		repeatRule: repeat?.rule ?? null
	};
}

export function formatDateChip(timestamp: string | null, now = new Date()) {
	const dateKey = timestamp?.slice(0, 10);
	if (!dateKey) return 'None';
	const today = getTodayDateKey(now);
	if (dateKey === today) return 'Today';
	if (dateKey === addDaysFromDate(today, 1)) return 'Tomorrow';
	return dateKey;
}

export function formatRepeatChip(rule: RepeatRule | null) {
	if (!rule) return 'None';
	if (rule.frequency === 'daily')
		return rule.interval && rule.interval > 1 ? `${rule.interval} days` : 'Daily';
	if (rule.frequency === 'weekly')
		return rule.daysOfWeek?.length ? `Weekly ${formatWeekdays(rule.daysOfWeek)}` : 'Weekly';
	if (rule.frequency === 'monthly') return 'Monthly';
	return 'Yearly';
}

function extractDateToken(input: string, keyword: 'due' | 'do', now: Date) {
	const pattern = new RegExp(
		`\\b${keyword}\\s+(today|tomorrow|next week|next sunday|next monday|next tuesday|next wednesday|next thursday|next friday|next saturday)\\b`,
		'i'
	);
	const match = input.match(pattern);
	if (!match || match.index === undefined) return null;
	return {
		start: match.index,
		end: match.index + match[0].length,
		dateKey: parseRelativeDate(match[1]!, now)
	};
}

function extractRepeat(input: string, now: Date) {
	const candidates: Array<{ start: number; end: number; rule: RepeatRule }> = [];
	addRepeatCandidate(candidates, input, /\bevery day\b|\bdaily\b/i, {
		frequency: 'daily',
		interval: 1
	});
	addRepeatCandidate(candidates, input, /\bevery other day\b/i, {
		frequency: 'daily',
		interval: 2
	});
	addRepeatCandidate(candidates, input, /\bevery other week\b/i, {
		frequency: 'weekly',
		interval: 2
	});
	addRepeatCandidate(candidates, input, /\bevery week\b|\bweekly\b/i, {
		frequency: 'weekly',
		interval: 1,
		daysOfWeek: [now.getDay() as Weekday]
	});
	addRepeatCandidate(candidates, input, /\bevery month\b|\bmonthly\b/i, {
		frequency: 'monthly',
		dayOfMonth: now.getDate()
	});
	addRepeatCandidate(candidates, input, /\bevery year\b|\byearly\b/i, {
		frequency: 'yearly',
		month: now.getMonth() + 1,
		dayOfMonth: now.getDate()
	});

	for (const match of input.matchAll(/\bevery\s+([2-9])\s+(days?|weeks?)\b/gi)) {
		const unit = match[2]!.toLowerCase();
		candidates.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			rule: unit.startsWith('day')
				? { frequency: 'daily', interval: Number(match[1]) }
				: { frequency: 'weekly', interval: Number(match[1]) }
		});
	}

	for (const match of input.matchAll(
		/\bevery(?: week)? on\s+((?:(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?)(?:\s*,\s*|\s+and\s+|\s+)*)+)/gi
	)) {
		const days = parseWeekdays(match[1] ?? '');
		if (days.length > 0) {
			candidates.push({
				start: match.index ?? 0,
				end: (match.index ?? 0) + match[0].length,
				rule: { frequency: 'weekly', interval: 1, daysOfWeek: days }
			});
		}
	}

	return (
		candidates.sort(
			(left, right) => right.start - left.start || right.end - right.start - (left.end - left.start)
		)[0] ?? null
	);
}

function addRepeatCandidate(
	candidates: Array<{ start: number; end: number; rule: RepeatRule }>,
	input: string,
	pattern: RegExp,
	rule: RepeatRule
) {
	const match = input.match(pattern);
	if (match?.index !== undefined) {
		candidates.push({ start: match.index, end: match.index + match[0].length, rule });
	}
}

function parseRelativeDate(value: string, now: Date) {
	const today = getTodayDateKey(now);
	const lower = value.toLowerCase();
	if (lower === 'today') return today;
	if (lower === 'tomorrow') return addDaysFromDate(today, 1);
	if (lower === 'next week' || lower === 'next sunday') return nextWeekday(today, 0);
	const weekday = lower.replace('next ', '');
	return nextWeekday(today, WEEKDAY_NAMES[weekday] ?? 0);
}

function nextWeekday(today: string, day: Weekday) {
	const date = parseDateKey(today);
	const delta = (day - date.getDay() + 7) % 7 || 7;
	return addDaysFromDate(today, delta);
}

function addDaysFromDate(dateKey: string, count: number) {
	const date = parseDateKey(dateKey);
	date.setDate(date.getDate() + count);
	return toDateKey(date);
}

function parseWeekdays(input: string): Weekday[] {
	const days: Weekday[] = [];
	for (const match of input.matchAll(
		/\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/gi
	)) {
		const day = WEEKDAY_NAMES[match[1]!.toLowerCase()];
		if (day !== undefined && !days.includes(day)) days.push(day);
	}
	return days.sort((left, right) => left - right);
}

function formatWeekdays(days: Weekday[]) {
	const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return days.map((day) => labels[day]).join(', ');
}

function normalizeSpaces(input: string) {
	return input.replace(/\s+/g, ' ').trim();
}

function removeRange(input: string, start: number, end: number) {
	return normalizeSpaces(`${input.slice(0, start)} ${input.slice(end)}`);
}
