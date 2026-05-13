export const ANONYMOUS_USER_ID = 'anonymous';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type HabitRecurrence =
	| { type: 'days'; interval: number }
	| { type: 'weeks'; interval: number }
	| { type: 'daysOfWeek'; days: Weekday[]; interval: number };

export interface Habit {
	id: string;
	userId: string;
	title: string;
	targetCount: number;
	recurrence: HabitRecurrence;
	replacesHabitId: string | null;
	createdAt: string;
	updatedAt: string;
	archivedAt: string | null;
	deletedAt: string | null;
	lastSyncedAt: string | null;
}

export interface Completion {
	userId: string;
	habitId: string;
	completedOn: string;
	count: number;
	createdAt: string;
	updatedAt: string;
	lastSyncedAt: string | null;
}

export interface HabitProgress {
	habit: Habit;
	count: number;
	target: number;
	ratio: number;
	complete: boolean;
}

export interface RepeatSnapshot {
	habits: Habit[];
	completions: Completion[];
}

export interface ParsedHabitInput {
	title: string;
	targetCount: number;
	recurrence: HabitRecurrence;
}

export const DEFAULT_RECURRENCE: HabitRecurrence = { type: 'days', interval: 1 };
