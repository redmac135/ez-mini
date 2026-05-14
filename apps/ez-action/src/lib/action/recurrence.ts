import {
	addDays,
	addMonthsClamped,
	addYearsClamped,
	getOrdinalWeekdayDate,
	getTodayDateKey,
	nextWeekdayDate,
	parseDateKey,
	timestampToDateKey,
	createTimestampForDate
} from './dates';
import type { ActionTask, RepeatRule, Weekday } from './types';

export function advanceTaskDate(timestamp: string | null, rule: RepeatRule, fromDateKey?: string) {
	const dateKey = timestampToDateKey(timestamp) ?? fromDateKey ?? getTodayDateKey();
	const nextKey = advanceDateKey(dateKey, rule);
	return createTimestampForDate(nextKey);
}

export function spawnRepeatedTask(
	task: ActionTask,
	now = new Date(),
	rollForwardPastDates = false
): ActionTask | null {
	if (!task.repeatRule) {
		return null;
	}

	const timestamp = now.toISOString();
	const today = getTodayDateKey(now);
	let plannedAt = task.plannedAt ? advanceTaskDate(task.plannedAt, task.repeatRule, today) : null;
	let dueAt = task.dueAt ? advanceTaskDate(task.dueAt, task.repeatRule, today) : null;

	if (rollForwardPastDates) {
		plannedAt = rollForward(plannedAt, task.repeatRule, today);
		dueAt = rollForward(dueAt, task.repeatRule, today);
	}

	return {
		...task,
		id: createId('task'),
		plannedAt,
		dueAt,
		today: false,
		completedAt: null,
		archivedAt: null,
		deletedAt: null,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

export function repeatedTaskHasPastDates(task: ActionTask, now = new Date()) {
	if (!task.repeatRule) return false;
	const today = getTodayDateKey(now);
	const planned = task.plannedAt ? advanceTaskDate(task.plannedAt, task.repeatRule, today) : null;
	const due = task.dueAt ? advanceTaskDate(task.dueAt, task.repeatRule, today) : null;
	return isPast(planned, today) || isPast(due, today);
}

export function advanceDateKey(dateKey: string, rule: RepeatRule) {
	const interval = Math.max(1, rule.interval ?? 1);
	if (rule.frequency === 'daily') return addDays(dateKey, interval);
	if (rule.frequency === 'weekly') {
		return nextWeekdayDate(
			dateKey,
			rule.daysOfWeek?.length ? rule.daysOfWeek : [parseDateKey(dateKey).getDay() as Weekday],
			interval
		);
	}
	if (rule.frequency === 'monthly') {
		if (rule.weekOfMonth !== undefined && rule.dayOfWeek !== undefined) {
			const source = parseDateKey(addMonthsClamped(dateKey, interval));
			return getOrdinalWeekdayDate(
				source.getFullYear(),
				source.getMonth() + 1,
				rule.weekOfMonth,
				rule.dayOfWeek
			);
		}
		return addMonthsClamped(dateKey, interval, rule.dayOfMonth);
	}

	if (rule.weekOfMonth !== undefined && rule.dayOfWeek !== undefined) {
		const source = parseDateKey(addYearsClamped(dateKey, interval, rule.month));
		return getOrdinalWeekdayDate(
			source.getFullYear(),
			rule.month ?? source.getMonth() + 1,
			rule.weekOfMonth,
			rule.dayOfWeek
		);
	}
	return addYearsClamped(dateKey, interval, rule.month, rule.dayOfMonth);
}

function rollForward(timestamp: string | null, rule: RepeatRule, today: string) {
	if (!timestamp) return null;
	let dateKey = timestampToDateKey(timestamp)!;
	while (dateKey < today) {
		dateKey = advanceDateKey(dateKey, rule);
	}
	return createTimestampForDate(dateKey);
}

function isPast(timestamp: string | null, today: string) {
	return timestamp !== null && timestampToDateKey(timestamp)! < today;
}

function createId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
