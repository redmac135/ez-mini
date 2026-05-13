import { addDays, createTimestampForDate, getTodayDateKey } from './dates';
import type { Completion, Habit } from './types';
import { ANONYMOUS_USER_ID } from './types';

export function createMockRepeatData(todayDateKey = getTodayDateKey()) {
	const createdAt = createTimestampForDate(addDays(todayDateKey, -10));
	const habits: Habit[] = [
		{
			id: 'habit-morning-stretch',
			userId: ANONYMOUS_USER_ID,
			title: 'Morning stretch',
			targetCount: 1,
			recurrence: { type: 'days', interval: 1 },
			createdAt,
			archivedAt: null,
			deletedAt: null
		},
		{
			id: 'habit-read',
			userId: ANONYMOUS_USER_ID,
			title: 'Read 10 pages',
			targetCount: 1,
			recurrence: { type: 'days', interval: 1 },
			createdAt,
			archivedAt: null,
			deletedAt: null
		},
		{
			id: 'habit-lift',
			userId: ANONYMOUS_USER_ID,
			title: 'Lift weights',
			targetCount: 3,
			recurrence: { type: 'weeks', interval: 1 },
			createdAt,
			archivedAt: null,
			deletedAt: null
		},
		{
			id: 'habit-call-mom',
			userId: ANONYMOUS_USER_ID,
			title: 'Call mom',
			targetCount: 1,
			recurrence: { type: 'daysOfWeek', days: [1, 3, 5], interval: 1 },
			createdAt,
			archivedAt: null,
			deletedAt: null
		},
		{
			id: 'habit-old-journal',
			userId: ANONYMOUS_USER_ID,
			title: 'Evening journal',
			targetCount: 1,
			recurrence: { type: 'days', interval: 1 },
			createdAt,
			archivedAt: createTimestampForDate(addDays(todayDateKey, -2)),
			deletedAt: null
		}
	];

	const completions: Completion[] = [
		createCompletion('completion-stretch-today', 'habit-morning-stretch', todayDateKey),
		createCompletion('completion-read-yesterday', 'habit-read', addDays(todayDateKey, -1)),
		createCompletion('completion-lift-1', 'habit-lift', addDays(todayDateKey, -2)),
		createCompletion('completion-lift-2', 'habit-lift', addDays(todayDateKey, -1)),
		createCompletion('completion-journal-old', 'habit-old-journal', addDays(todayDateKey, -4))
	];

	return { habits, completions };
}

function createCompletion(id: string, habitId: string, completedAt: string): Completion {
	return {
		id,
		userId: ANONYMOUS_USER_ID,
		habitId,
		completedAt
	};
}
