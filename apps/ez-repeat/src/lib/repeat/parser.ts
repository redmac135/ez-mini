import type { HabitRecurrence, ParsedHabitInput, Weekday } from './types';
import { DEFAULT_RECURRENCE } from './types';

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

const NUMBER_WORDS: Record<string, number> = {
	once: 1,
	twice: 2,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9
};

export function parseHabitInput(input: string): ParsedHabitInput {
	let working = normalizeSpaces(input);
	const schedule = extractSchedule(working);
	if (schedule) {
		working = removeRange(working, schedule.start, schedule.end);
	}

	const frequency = extractFrequency(working);
	if (frequency) {
		working = removeRange(working, frequency.start, frequency.end);
	}

	const title = cleanupTitle(working);

	return {
		title: title || 'untitled habit',
		targetCount: frequency?.targetCount ?? 1,
		recurrence: schedule?.recurrence ?? DEFAULT_RECURRENCE
	};
}

export function formatFrequency(targetCount: number) {
	return `${Math.max(1, Math.min(9, targetCount))}x`;
}

export function formatRecurrence(recurrence: HabitRecurrence) {
	if (recurrence.type === 'days') {
		return recurrence.interval === 1 ? 'daily' : `${recurrence.interval} days`;
	}

	if (recurrence.type === 'weeks') {
		return recurrence.interval === 1 ? 'weekly' : `${recurrence.interval} weeks`;
	}

	const sortedDays = [...recurrence.days].sort((left, right) => left - right);
	const dayText = formatDays(sortedDays);
	const intervalText = recurrence.interval === 1 ? '' : ' every other week';
	return `${dayText}${intervalText}`;
}

function extractSchedule(input: string) {
	const candidates: Array<{ start: number; end: number; recurrence: HabitRecurrence }> = [];

	for (const match of input.matchAll(/\b(?:daily|every day|each day|a day|per day|every (?:morning|afternoon|evening))\b/gi)) {
		candidates.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			recurrence: { type: 'days', interval: 1 }
		});
	}

	for (const match of input.matchAll(/\b(?:weekly|every week|each week|a week|per week)\b/gi)) {
		candidates.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			recurrence: { type: 'weeks', interval: 1 }
		});
	}

	for (const match of input.matchAll(/\bevery other week\b/gi)) {
		candidates.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			recurrence: { type: 'weeks', interval: 2 }
		});
	}

	for (const match of input.matchAll(/\bevery\s+([2-9])\s+weeks?\b/gi)) {
		candidates.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			recurrence: { type: 'weeks', interval: Number(match[1]) }
		});
	}

	for (const match of input.matchAll(/\bevery\s+([2-9])\s+days?\b/gi)) {
		candidates.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			recurrence: { type: 'days', interval: Number(match[1]) }
		});
	}

	for (const match of input.matchAll(/\b(?:on|every)\s+((?:(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?)(?:\s*,\s*|\s+and\s+|\s+)*)+)/gi)) {
		const days = parseWeekdays(match[1] ?? '');
		if (days.length > 0) {
			candidates.push({
				start: match.index ?? 0,
				end: (match.index ?? 0) + match[0].length,
				recurrence: { type: 'daysOfWeek', days, interval: 1 }
			});
		}
	}

	return candidates.sort((left, right) => right.start - left.start)[0];
}

function extractFrequency(input: string) {
	const candidates: Array<{ start: number; end: number; targetCount: number }> = [];

	for (const match of input.matchAll(/\b(once|twice)\b/gi)) {
		candidates.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			targetCount: NUMBER_WORDS[match[1]!.toLowerCase()] ?? 1
		});
	}

	for (const match of input.matchAll(/\b([1-9]|one|two|three|four|five|six|seven|eight|nine)\s*(?:times?|x|×)\b/gi)) {
		const raw = match[1]!.toLowerCase();
		candidates.push({
			start: match.index ?? 0,
			end: (match.index ?? 0) + match[0].length,
			targetCount: NUMBER_WORDS[raw] ?? Number(raw)
		});
	}

	return candidates.sort((left, right) => right.start - left.start)[0];
}

function parseWeekdays(input: string): Weekday[] {
	const days: Weekday[] = [];
	for (const match of input.matchAll(/\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/gi)) {
		const day = WEEKDAY_NAMES[match[1]!.toLowerCase()];
		if (day !== undefined && !days.includes(day)) {
			days.push(day);
		}
	}

	return days.sort((left, right) => left - right);
}

function normalizeSpaces(input: string) {
	return input.replace(/\s+/g, ' ').trim();
}

function removeRange(input: string, start: number, end: number) {
	return normalizeSpaces(`${input.slice(0, start)} ${input.slice(end)}`);
}

function cleanupTitle(input: string) {
	return normalizeSpaces(
		input
			.replace(/\b(?:a|an|per)\b/gi, ' ')
			.replace(/\b(?:times?)\b/gi, ' ')
			.replace(/\s+/g, ' ')
	).replace(/^[, ]+|[, ]+$/g, '');
}

function formatDays(days: Weekday[]) {
	if (days.join(',') === '1,2,3,4,5') {
		return 'weekdays';
	}

	if (days.join(',') === '0,6') {
		return 'weekends';
	}

	const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return days.map((day) => labels[day]).join(', ');
}
