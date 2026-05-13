import { derived, get, writable } from 'svelte/store';
import { addDays, createTimestampForDate, getTodayDateKey } from './dates';
import { getCompletionWindow } from './recurrence';
import { buildHabitProgress, getCompletionScore } from './recurrence';
import { RepeatStorage } from './storage';
import type { Habit, HabitProgress, ParsedHabitInput, RepeatSnapshot } from './types';
import { ANONYMOUS_USER_ID } from './types';

export type ThemeMode = 'light' | 'dark';

interface RepeatState {
	loaded: boolean;
	selectedDate: string;
	todayDate: string;
	snapshot: RepeatSnapshot;
	themeMode: ThemeMode;
}

export interface RepeatViewModel extends RepeatState {
	progress: HabitProgress[];
	completionScore: number;
	isToday: boolean;
}

const DEFAULT_STATE: RepeatState = {
	loaded: false,
	selectedDate: getTodayDateKey(),
	todayDate: getTodayDateKey(),
	snapshot: {
		habits: [],
		completions: []
	},
	themeMode: 'light'
};

export function createRepeatController() {
	const state = writable<RepeatState>(DEFAULT_STATE);
	const view = derived(state, ($state): RepeatViewModel => {
		const progress = buildHabitProgress(
			$state.snapshot.habits,
			$state.snapshot.completions,
			$state.selectedDate
		);

		return {
			...$state,
			progress,
			completionScore: getCompletionScore(progress),
			isToday: $state.selectedDate === $state.todayDate
		};
	});

	async function load() {
		const todayDate = getTodayDateKey();
		await RepeatStorage.resetWithMockData();
		const [snapshot, savedThemeMode] = await Promise.all([
			RepeatStorage.loadSnapshot(),
			RepeatStorage.getSetting<ThemeMode>('themeMode')
		]);
		state.set({
			loaded: true,
			selectedDate: todayDate,
			todayDate,
			snapshot,
			themeMode: savedThemeMode === 'dark' ? 'dark' : 'light'
		});
	}

	async function refresh() {
		const snapshot = await RepeatStorage.loadSnapshot();
		state.update((current) => ({ ...current, snapshot }));
	}

	function selectDate(dateKey: string) {
		state.update((current) => ({ ...current, selectedDate: dateKey }));
	}

	function moveDate(delta: number) {
		state.update((current) => ({
			...current,
			selectedDate: addDays(current.selectedDate, delta)
		}));
	}

	function selectToday() {
		state.update((current) => ({
			...current,
			selectedDate: getTodayDateKey(),
			todayDate: getTodayDateKey()
		}));
	}

	async function createHabit(parsed: ParsedHabitInput) {
		const current = get(state);
		await RepeatStorage.addHabit(createHabitRecord(parsed, current.selectedDate));
		await refresh();
	}

	async function editHabit(habitId: string, parsed: ParsedHabitInput) {
		const current = get(state);
		const archivedAt = createTimestampForDate(current.selectedDate);
		await RepeatStorage.archiveHabit(habitId, archivedAt);
		await RepeatStorage.addHabit(createHabitRecord(parsed, current.selectedDate));
		await refresh();
	}

	function createHabitRecord(parsed: ParsedHabitInput, dateKey: string): Habit {
		return {
			id: createId('habit'),
			userId: ANONYMOUS_USER_ID,
			title: parsed.title,
			targetCount: parsed.targetCount,
			recurrence: parsed.recurrence,
			createdAt: createTimestampForDate(dateKey),
			archivedAt: null,
			deletedAt: null
		};
	}

	async function addCompletion(progress: HabitProgress) {
		if (progress.complete) {
			return;
		}

		const current = get(state);
		await RepeatStorage.addCompletion({
			id: createId('completion'),
			userId: ANONYMOUS_USER_ID,
			habitId: progress.habit.id,
			completedAt: current.selectedDate
		});
		await refresh();
	}

	async function undoCompletion(progress: HabitProgress) {
		if (progress.count <= 0) {
			return;
		}

		const current = get(state);
		const window = getCompletionWindow(progress.habit, current.selectedDate);
		await RepeatStorage.deleteLatestCompletion(progress.habit.id, window.startDate, window.endDate);
		await refresh();
	}

	async function archiveHabit(habitId: string) {
		const current = get(state);
		await RepeatStorage.archiveHabit(habitId, createTimestampForDate(current.selectedDate));
		await refresh();
	}

	async function deleteHabit(habitId: string) {
		await RepeatStorage.deleteHabit(habitId);
		await refresh();
	}

	async function resetDemoData() {
		await RepeatStorage.resetWithMockData();
		await refresh();
	}

	async function setThemeMode(themeMode: ThemeMode) {
		await RepeatStorage.setSetting('themeMode', themeMode);
		state.update((current) => ({ ...current, themeMode }));
	}

	return {
		subscribe: view.subscribe,
		load,
		selectDate,
		moveDate,
		selectToday,
		createHabit,
		editHabit,
		addCompletion,
		undoCompletion,
		archiveHabit,
		deleteHabit,
		resetDemoData,
		setThemeMode
	};
}

function createId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
