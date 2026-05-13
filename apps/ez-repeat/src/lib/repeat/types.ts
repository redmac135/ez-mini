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
	createdAt: string;
	archivedAt: string | null;
	deletedAt: string | null;
}

export interface Completion {
	id: string;
	userId: string;
	habitId: string;
	completedAt: string;
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
