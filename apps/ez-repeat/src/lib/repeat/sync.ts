import { createSyncEngine } from '@ez/sync';
import { RepeatStorage } from './storage';
import type { Completion, Habit, HabitRecurrence } from './types';

export interface RemoteRepeatHabitRow {
	id: string;
	user_id: string;
	title: string;
	target_count: number;
	recurrence: unknown;
	replaces_habit_id: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface RemoteRepeatCompletionRow {
	user_id: string;
	habit_id: string;
	completed_on: string;
	count: number;
	created_at: string;
	updated_at: string;
}

export interface RepeatApi {
	listHabits(options?: { since?: string | null }): Promise<RemoteRepeatHabitRow[]>;
	upsertHabit(habit: RemoteRepeatHabitRow): Promise<RemoteRepeatHabitRow>;
	listCompletions(options?: { since?: string | null }): Promise<RemoteRepeatCompletionRow[]>;
	upsertCompletion(completion: RemoteRepeatCompletionRow): Promise<RemoteRepeatCompletionRow>;
}

export interface RepeatSyncResult {
	habitsPushed: number;
	habitsPulled: number;
	completionsPushed: number;
	completionsPulled: number;
}

export async function syncRepeatData(api: RepeatApi, userId: string): Promise<RepeatSyncResult> {
	const [habitResult, completionResult] = await Promise.all([
		syncHabits(api, userId),
		syncCompletions(api, userId)
	]);

	return {
		habitsPushed: habitResult.pushed,
		habitsPulled: habitResult.pulled,
		completionsPushed: completionResult.pushed,
		completionsPulled: completionResult.pulled
	};
}

function syncHabits(api: RepeatApi, userId: string) {
	return createSyncEngine<Habit, RemoteRepeatHabitRow>({
		pull: (since) => api.listHabits({ since }),
		push: (habit) => api.upsertHabit(habit),
		getLocal: async () => (await RepeatStorage.loadSnapshot(userId)).habits,
		saveLocal: (habits) => RepeatStorage.saveHabits(habits),
		toRemote: (habit) => ({
			id: habit.id,
			user_id: userId,
			title: habit.title,
			target_count: habit.targetCount,
			recurrence: habit.recurrence,
			replaces_habit_id: habit.replacesHabitId,
			archived_at: habit.archivedAt,
			deleted_at: habit.deletedAt,
			created_at: habit.createdAt,
			updated_at: habit.updatedAt
		}),
		toLocal: (remote, existing) => ({
			id: remote.id,
			userId: remote.user_id,
			title: remote.title,
			targetCount: remote.target_count,
			recurrence: normalizeRecurrence(remote.recurrence),
			replacesHabitId: remote.replaces_habit_id,
			archivedAt: remote.archived_at,
			deletedAt: remote.deleted_at,
			createdAt: remote.created_at,
			updatedAt: remote.updated_at,
			lastSyncedAt: existing?.lastSyncedAt ?? null
		}),
		getId: (habit) => habit.id,
		getSince: () => null,
		getLocalUpdatedAt: (habit) => habit.updatedAt,
		getRemoteUpdatedAt: (habit) => habit.updated_at,
		getLocalDeletedAt: (habit) => habit.deletedAt,
		getRemoteDeletedAt: (habit) => habit.deleted_at,
		getLastSyncedAt: (habit) => habit.lastSyncedAt,
		setLastSyncedAt: (habit, value) => ({ ...habit, lastSyncedAt: value }),
		areStatesEqual: (local, remote) =>
			local.title === remote.title &&
			local.targetCount === remote.target_count &&
			JSON.stringify(local.recurrence) === JSON.stringify(remote.recurrence) &&
			(local.replacesHabitId ?? null) === (remote.replaces_habit_id ?? null) &&
			(local.archivedAt ?? null) === (remote.archived_at ?? null) &&
			(local.deletedAt ?? null) === (remote.deleted_at ?? null),
		onConflict: async (local, remote, helpers) => {
			if (local.updatedAt > remote.updated_at) {
				return [await helpers.push(local)];
			}
			return [
				{
					...toLocalHabit(remote, local),
					lastSyncedAt: remote.updated_at
				}
			];
		}
	}).sync();
}

function syncCompletions(api: RepeatApi, userId: string) {
	return createSyncEngine<Completion, RemoteRepeatCompletionRow>({
		pull: (since) => api.listCompletions({ since }),
		push: (completion) => api.upsertCompletion(completion),
		getLocal: async () => (await RepeatStorage.loadSnapshot(userId)).completions,
		saveLocal: (completions) => RepeatStorage.saveCompletions(completions),
		toRemote: (completion) => ({
			user_id: userId,
			habit_id: completion.habitId,
			completed_on: completion.completedOn,
			count: completion.count,
			created_at: completion.createdAt,
			updated_at: completion.updatedAt
		}),
		toLocal: (remote, existing) => ({
			userId: remote.user_id,
			habitId: remote.habit_id,
			completedOn: remote.completed_on,
			count: remote.count,
			createdAt: remote.created_at,
			updatedAt: remote.updated_at,
			lastSyncedAt: existing?.lastSyncedAt ?? null
		}),
		getId: (completion) =>
			'habit_id' in completion
				? `${completion.habit_id}::${completion.completed_on}`
				: `${completion.habitId}::${completion.completedOn}`,
		getSince: () => null,
		getLocalUpdatedAt: (completion) => completion.updatedAt,
		getRemoteUpdatedAt: (completion) => completion.updated_at,
		getLocalDeletedAt: () => null,
		getRemoteDeletedAt: () => null,
		getLastSyncedAt: (completion) => completion.lastSyncedAt,
		setLastSyncedAt: (completion, value) => ({ ...completion, lastSyncedAt: value }),
		areStatesEqual: (local, remote) => local.count === remote.count,
		onConflict: async (local, remote, helpers) => {
			if (local.updatedAt > remote.updated_at) {
				return [await helpers.push(local)];
			}
			return [
				{
					userId: remote.user_id,
					habitId: remote.habit_id,
					completedOn: remote.completed_on,
					count: remote.count,
					createdAt: remote.created_at,
					updatedAt: remote.updated_at,
					lastSyncedAt: remote.updated_at
				}
			];
		}
	}).sync();
}

function toLocalHabit(remote: RemoteRepeatHabitRow, existing?: Habit | null): Habit {
	return {
		id: remote.id,
		userId: remote.user_id,
		title: remote.title,
		targetCount: remote.target_count,
		recurrence: normalizeRecurrence(remote.recurrence),
		replacesHabitId: remote.replaces_habit_id,
		archivedAt: remote.archived_at,
		deletedAt: remote.deleted_at,
		createdAt: remote.created_at,
		updatedAt: remote.updated_at,
		lastSyncedAt: existing?.lastSyncedAt ?? null
	};
}

function normalizeRecurrence(value: unknown): HabitRecurrence {
	if (value && typeof value === 'object' && 'type' in value) {
		const recurrence = value as HabitRecurrence;
		if (
			recurrence.type === 'days' ||
			recurrence.type === 'weeks' ||
			recurrence.type === 'daysOfWeek'
		) {
			return recurrence;
		}
	}

	return { type: 'days', interval: 1 };
}
