export type ThemeMode = 'light' | 'dark';
export type ActionListId = 'today' | 'planned' | 'tasks' | string;
export type RepeatFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RepeatRule {
	frequency: RepeatFrequency;
	interval?: number;
	daysOfWeek?: Weekday[];
	dayOfMonth?: number;
	weekOfMonth?: number;
	dayOfWeek?: Weekday;
	month?: number;
}

export interface ActionList {
	id: string;
	userId: string;
	name: string;
	archivedAt: string | null;
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ActionTask {
	id: string;
	userId: string;
	listId: string | null;
	title: string;
	plannedAt: string | null;
	dueAt: string | null;
	today: boolean;
	repeatRule: RepeatRule | null;
	completedAt: string | null;
	archivedAt: string | null;
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ActionSnapshot {
	lists: ActionList[];
	tasks: ActionTask[];
}

export interface ParsedTaskInput {
	title: string;
	dueAt: string | null;
	plannedAt: string | null;
	repeatRule: RepeatRule | null;
}

export interface ActionViewModel {
	loaded: boolean;
	activeListId: ActionListId;
	lists: ActionList[];
	tasks: ActionTask[];
	activeTasks: ActionTask[];
	completedActiveTasks: ActionTask[];
	todayTasks: ActionTask[];
	plannedTasks: ActionTask[];
	themeMode: ThemeMode;
}

export const ANONYMOUS_USER_ID = 'anonymous';
export const DEFAULT_LIST_ID = 'tasks';
export const DERIVED_TODAY_ID = 'today';
export const DERIVED_PLANNED_ID = 'planned';
