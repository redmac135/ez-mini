import { derived, get, writable } from 'svelte/store';
import { addDays, createTimestampForDate, getTodayDateKey } from './dates';
import { buildHabitProgress, getCompletionScore } from './recurrence';
import {
	REPEAT_STORAGE_CHANGED_EVENT,
	REPEAT_STORAGE_CHANNEL_NAME,
	RepeatStorage
} from './storage';
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
	let activeUserId = ANONYMOUS_USER_ID;
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

	async function load(userId = activeUserId) {
		activeUserId = userId;
		const todayDate = getTodayDateKey();
		const [snapshot, savedThemeMode] = await Promise.all([
			RepeatStorage.loadSnapshot(activeUserId),
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
		const snapshot = await RepeatStorage.loadSnapshot(activeUserId);
		state.update((current) => ({ ...current, snapshot }));
	}

	async function setUserId(userId: string | null) {
		activeUserId = userId ?? ANONYMOUS_USER_ID;
		await load(activeUserId);
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
		await RepeatStorage.archiveHabit(habitId, archivedAt, new Date().toISOString());
		await RepeatStorage.addHabit(createHabitRecord(parsed, current.selectedDate, habitId));
		await refresh();
	}

	function createHabitRecord(
		parsed: ParsedHabitInput,
		dateKey: string,
		replacesHabitId: string | null = null
	): Habit {
		const createdAt = createTimestampForDate(dateKey);
		const updatedAt = new Date().toISOString();
		return {
			id: createId('habit'),
			userId: activeUserId,
			title: parsed.title,
			targetCount: parsed.targetCount,
			recurrence: parsed.recurrence,
			replacesHabitId,
			createdAt,
			updatedAt,
			archivedAt: null,
			deletedAt: null,
			lastSyncedAt: null
		};
	}

	async function addCompletion(progress: HabitProgress) {
		if (progress.complete) {
			return;
		}

		const current = get(state);
		const timestamp = new Date().toISOString();
		await RepeatStorage.incrementCompletion(
			{
				userId: activeUserId,
				habitId: progress.habit.id,
				completedOn: current.selectedDate,
				count: 1,
				createdAt: timestamp,
				updatedAt: timestamp,
				lastSyncedAt: null
			},
			progress.target
		);
		await refresh();
	}

	async function undoCompletion(progress: HabitProgress) {
		if (progress.count <= 0) {
			return;
		}

		const current = get(state);
		await RepeatStorage.decrementCompletion(
			progress.habit.id,
			current.selectedDate,
			new Date().toISOString()
		);
		await refresh();
	}

	async function archiveHabit(habitId: string) {
		const current = get(state);
		await RepeatStorage.archiveHabit(
			habitId,
			createTimestampForDate(current.selectedDate),
			new Date().toISOString()
		);
		await refresh();
	}

	async function deleteHabit(habitId: string) {
		await RepeatStorage.deleteHabit(habitId, new Date().toISOString());
		await refresh();
	}

	async function setThemeMode(themeMode: ThemeMode) {
		await RepeatStorage.setSetting('themeMode', themeMode);
		state.update((current) => ({ ...current, themeMode }));
	}

	return {
		subscribe: view.subscribe,
		load,
		refresh,
		setUserId,
		subscribeToExternalChanges: () => createExternalStorageSubscription(refresh),
		selectDate,
		moveDate,
		selectToday,
		createHabit,
		editHabit,
		addCompletion,
		undoCompletion,
		archiveHabit,
		deleteHabit,
		setThemeMode
	};
}

function createExternalStorageSubscription(refresh: () => Promise<void>) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	let channel: BroadcastChannel | null = null;
	const handleChange = () => {
		void refresh();
	};
	window.addEventListener(REPEAT_STORAGE_CHANGED_EVENT, handleChange);
	if (typeof BroadcastChannel !== 'undefined') {
		channel = new BroadcastChannel(REPEAT_STORAGE_CHANNEL_NAME);
		channel.onmessage = handleChange;
	}

	return () => {
		window.removeEventListener(REPEAT_STORAGE_CHANGED_EVENT, handleChange);
		channel?.close();
	};
}

function createId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
