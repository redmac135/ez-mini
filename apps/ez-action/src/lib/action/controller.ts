import { derived, get, writable } from 'svelte/store';
import { getTodayDateKey, timestampToDateKey } from './dates';
import { repeatedTaskHasPastDates, spawnRepeatedTask } from './recurrence';
import {
	ACTION_STORAGE_CHANGED_EVENT,
	ACTION_STORAGE_CHANNEL_NAME,
	ActionStorage
} from './storage';
import type {
	ActionList,
	ActionListId,
	ActionSnapshot,
	ActionTask,
	ActionViewModel,
	ParsedTaskInput,
	ThemeMode
} from './types';
import { ANONYMOUS_USER_ID, DEFAULT_LIST_ID, DERIVED_PLANNED_ID, DERIVED_TODAY_ID } from './types';

interface ActionState {
	loaded: boolean;
	activeListId: ActionListId;
	snapshot: ActionSnapshot;
	themeMode: ThemeMode;
}

const DEFAULT_STATE: ActionState = {
	loaded: false,
	activeListId: DEFAULT_LIST_ID,
	snapshot: { lists: [], tasks: [] },
	themeMode: 'light'
};

export function createActionController() {
	const state = writable<ActionState>(DEFAULT_STATE);
	let activeUserId = ANONYMOUS_USER_ID;

	const view = derived(state, ($state): ActionViewModel => {
		const today = getTodayDateKey();
		const visibleLists = $state.snapshot.lists.filter(
			(list) => !list.deletedAt && !list.archivedAt
		);
		const visibleTasks = $state.snapshot.tasks.filter(
			(task) => !task.deletedAt && !task.archivedAt
		);
		const openTasks = visibleTasks.filter((task) => !task.completedAt);
		const todayTasks = openTasks
			.filter(
				(task) =>
					task.listId !== null &&
					(task.today || isDueOrPlanned(task.plannedAt, today) || isDueOrPlanned(task.dueAt, today))
			)
			.sort(sortTasks);
		const plannedTasks = openTasks
			.filter((task) => task.listId !== null && task.dueAt !== null)
			.sort(
				(left, right) =>
					(left.dueAt ?? '').localeCompare(right.dueAt ?? '') || sortTasks(left, right)
			);
		const activeOpenTasks =
			$state.activeListId === DERIVED_TODAY_ID
				? todayTasks
				: $state.activeListId === DERIVED_PLANNED_ID
					? plannedTasks
					: openTasks
							.filter((task) => (task.listId ?? DEFAULT_LIST_ID) === $state.activeListId)
							.sort(sortTasks);
		const completedActiveTasks = visibleTasks
			.filter((task) => task.completedAt !== null)
			.filter((task) =>
				$state.activeListId === DERIVED_TODAY_ID
					? task.listId !== null &&
						(task.today ||
							isDueOrPlanned(task.plannedAt, today) ||
							isDueOrPlanned(task.dueAt, today))
					: $state.activeListId === DERIVED_PLANNED_ID
						? task.listId !== null && task.dueAt !== null
						: (task.listId ?? DEFAULT_LIST_ID) === $state.activeListId
			)
			.sort((left, right) => (right.completedAt ?? '').localeCompare(left.completedAt ?? ''));

		return {
			loaded: $state.loaded,
			activeListId: $state.activeListId,
			lists: visibleLists,
			tasks: visibleTasks,
			activeTasks: activeOpenTasks,
			completedActiveTasks,
			todayTasks,
			plannedTasks,
			themeMode: $state.themeMode
		};
	});

	async function load(userId = activeUserId) {
		activeUserId = userId;
		const [snapshot, themeMode] = await Promise.all([
			ActionStorage.loadSnapshot(activeUserId),
			ActionStorage.getThemeMode()
		]);
		state.set({ loaded: true, activeListId: get(state).activeListId, snapshot, themeMode });
	}

	async function refresh() {
		const snapshot = await ActionStorage.loadSnapshot(activeUserId);
		state.update((current) => ({ ...current, snapshot }));
	}

	async function setUserId(userId: string | null) {
		activeUserId = userId ?? ANONYMOUS_USER_ID;
		await load(activeUserId);
	}

	function selectList(listId: ActionListId) {
		state.update((current) => ({ ...current, activeListId: listId }));
	}

	async function setThemeMode(themeMode: ThemeMode) {
		await ActionStorage.setSetting('themeMode', themeMode);
		state.update((current) => ({ ...current, themeMode }));
	}

	async function createList(name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;
		const list = createListRecord(trimmed, activeUserId);
		await ActionStorage.putList(list);
		selectList(list.id);
		await refresh();
	}

	async function archiveList(listId: string, archived = true) {
		const current = get(state);
		const timestamp = archived ? new Date().toISOString() : null;
		const list = current.snapshot.lists.find((item) => item.id === listId);
		if (!list) return;
		const updatedAt = new Date().toISOString();
		const tasks = current.snapshot.tasks
			.filter((task) => task.listId === listId && !task.deletedAt)
			.map((task) => ({ ...task, archivedAt: timestamp, updatedAt }));
		await Promise.all([
			ActionStorage.putList({ ...list, archivedAt: timestamp, updatedAt }),
			ActionStorage.putTasks(tasks)
		]);
		if (get(state).activeListId === listId) selectList(DEFAULT_LIST_ID);
		await refresh();
	}

	async function deleteList(listId: string) {
		const current = get(state);
		const list = current.snapshot.lists.find((item) => item.id === listId);
		if (!list) return;
		const deletedAt = new Date().toISOString();
		const tasks = current.snapshot.tasks
			.filter((task) => task.listId === listId && !task.deletedAt)
			.map((task) => ({ ...task, deletedAt, updatedAt: deletedAt }));
		await Promise.all([
			ActionStorage.putList({ ...list, deletedAt, updatedAt: deletedAt }),
			ActionStorage.putTasks(tasks)
		]);
		if (get(state).activeListId === listId) selectList(DEFAULT_LIST_ID);
		await refresh();
	}

	async function createTask(parsed: ParsedTaskInput) {
		const current = get(state);
		const listId = isRealListId(current.activeListId) ? current.activeListId : DEFAULT_LIST_ID;
		await ActionStorage.putTask(
			createTaskRecord(parsed, listId === DEFAULT_LIST_ID ? null : listId)
		);
		await refresh();
	}

	async function updateTask(
		taskId: string,
		updates: Partial<Pick<ActionTask, 'title' | 'dueAt' | 'plannedAt' | 'repeatRule' | 'today'>>
	) {
		const task = get(state).snapshot.tasks.find((item) => item.id === taskId);
		if (!task) return;
		await ActionStorage.putTask({
			...task,
			...updates,
			title: updates.title?.trim() || task.title,
			updatedAt: new Date().toISOString()
		});
		await refresh();
	}

	async function markTaskToday(taskId: string) {
		await updateTask(taskId, { today: true });
	}

	async function deleteTask(taskId: string) {
		const task = get(state).snapshot.tasks.find((item) => item.id === taskId);
		if (!task) return;
		const deletedAt = new Date().toISOString();
		await ActionStorage.putTask({ ...task, deletedAt, updatedAt: deletedAt });
		await refresh();
	}

	async function completeTask(taskId: string, options: { rollForwardPastDates?: boolean } = {}) {
		const task = get(state).snapshot.tasks.find((item) => item.id === taskId);
		if (!task || task.completedAt) return;
		const completedAt = new Date().toISOString();
		const completed = { ...task, completedAt, updatedAt: completedAt };
		const spawned = spawnRepeatedTask(completed, new Date(), options.rollForwardPastDates ?? false);
		await ActionStorage.putTasks(spawned ? [completed, spawned] : [completed]);
		await refresh();
	}

	async function undoCompleteTask(taskId: string) {
		const task = get(state).snapshot.tasks.find((item) => item.id === taskId);
		if (!task || !task.completedAt) return;
		await ActionStorage.putTask({
			...task,
			completedAt: null,
			updatedAt: new Date().toISOString()
		});
		await refresh();
	}

	function needsPastDateConfirmation(taskId: string) {
		const task = get(state).snapshot.tasks.find((item) => item.id === taskId);
		return task ? repeatedTaskHasPastDates(task) : false;
	}

	return {
		subscribe: view.subscribe,
		load,
		refresh,
		setUserId,
		subscribeToExternalChanges: () => createExternalStorageSubscription(refresh),
		selectList,
		setThemeMode,
		createList,
		archiveList,
		deleteList,
		createTask,
		updateTask,
		markTaskToday,
		deleteTask,
		completeTask,
		undoCompleteTask,
		needsPastDateConfirmation
	};
}

export function createTaskRecord(
	parsed: ParsedTaskInput,
	listId: string | null,
	userId = ANONYMOUS_USER_ID
): ActionTask {
	const timestamp = new Date().toISOString();
	return {
		id: createId('task'),
		userId,
		listId,
		title: parsed.title.trim() || 'Untitled task',
		plannedAt: parsed.plannedAt,
		dueAt: parsed.dueAt,
		today: false,
		repeatRule: parsed.repeatRule,
		completedAt: null,
		archivedAt: null,
		deletedAt: null,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

function createListRecord(name: string, userId = ANONYMOUS_USER_ID): ActionList {
	const timestamp = new Date().toISOString();
	return {
		id: createId('list'),
		userId,
		name,
		archivedAt: null,
		deletedAt: null,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

function createExternalStorageSubscription(refresh: () => Promise<void>) {
	if (typeof window === 'undefined') return () => {};
	let channel: BroadcastChannel | null = null;
	const handleChange = () => void refresh();
	window.addEventListener(ACTION_STORAGE_CHANGED_EVENT, handleChange);
	if (typeof BroadcastChannel !== 'undefined') {
		channel = new BroadcastChannel(ACTION_STORAGE_CHANNEL_NAME);
		channel.onmessage = handleChange;
	}
	return () => {
		window.removeEventListener(ACTION_STORAGE_CHANGED_EVENT, handleChange);
		channel?.close();
	};
}

function isDueOrPlanned(timestamp: string | null, today: string) {
	const dateKey = timestampToDateKey(timestamp);
	return dateKey !== null && dateKey <= today;
}

function sortTasks(left: ActionTask, right: ActionTask) {
	return (
		(left.dueAt ?? '').localeCompare(right.dueAt ?? '') ||
		(left.plannedAt ?? '').localeCompare(right.plannedAt ?? '') ||
		left.createdAt.localeCompare(right.createdAt)
	);
}

function isRealListId(listId: ActionListId) {
	return listId !== DERIVED_TODAY_ID && listId !== DERIVED_PLANNED_ID;
}

function createId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeParsedTask(
	title: string,
	overrides: Partial<ParsedTaskInput> = {}
): ParsedTaskInput {
	return {
		title,
		dueAt: null,
		plannedAt: null,
		repeatRule: null,
		...overrides
	};
}
