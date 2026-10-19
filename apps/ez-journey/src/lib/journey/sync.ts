import { createSyncEngine } from '@ez/sync';
import type { StoredJourneyEntry } from '../journey';
import { JourneyStorage } from './storage';

export type RemoteJourneyEntry = {
	id: string;
	user_id: string;
	text: string;
	created_at: string;
	updated_at: string;
	sync_updated_at: string;
	deleted_at: string | null;
};

export interface JourneyApi {
	listEntries(options?: {
		since?: string | null;
		signal?: AbortSignal;
	}): Promise<RemoteJourneyEntry[]>;
	upsertEntry(
		entry: RemoteJourneyEntry,
		options?: { signal?: AbortSignal }
	): Promise<RemoteJourneyEntry>;
}

export async function syncJourneyEntries(api: JourneyApi, userId: string, signal?: AbortSignal) {
	let originalEntries: StoredJourneyEntry[] = [];
	const result = await createSyncEngine<StoredJourneyEntry, RemoteJourneyEntry>({
		pull: (since) => api.listEntries({ since, signal }),
		push: (entry) => api.upsertEntry(entry, { signal }),
		getLocal: async () => {
			originalEntries = await JourneyStorage.loadEntries(userId);
			return originalEntries;
		},
		saveLocal: (entries) => JourneyStorage.saveSyncResults(userId, originalEntries, entries),
		toRemote: (entry) => ({
			id: entry.id,
			user_id: userId,
			text: entry.text,
			created_at: entry.createdAt,
			updated_at: entry.updatedAt,
			sync_updated_at: entry.lastRemoteChangeAt ?? '',
			deleted_at: entry.deletedAt
		}),
		toLocal: (remote) => ({
			id: remote.id,
			userId: remote.user_id,
			text: remote.text,
			createdAt: remote.created_at,
			updatedAt: remote.updated_at,
			deletedAt: remote.deleted_at,
			lastSyncedAt: null,
			lastRemoteChangeAt: remote.sync_updated_at
		}),
		getId: (entry) => entry.id,
		pullIsDelta: true,
		getSince: (entries) => {
			const syncedAt = entries
				.map((entry) => entry.lastRemoteChangeAt ?? null)
				.filter((value): value is string => value !== null);
			return syncedAt.length
				? syncedAt.reduce((latest, value) => (value > latest ? value : latest))
				: null;
		},
		getLocalUpdatedAt: (entry) => entry.updatedAt,
		getRemoteUpdatedAt: (entry) => entry.updated_at,
		getLocalDeletedAt: (entry) => entry.deletedAt,
		getRemoteDeletedAt: (entry) => entry.deleted_at,
		getLastSyncedAt: (entry) => entry.lastSyncedAt,
		setLastSyncedAt: (entry, value) => ({ ...entry, lastSyncedAt: value }),
		areStatesEqual: (local, remote) =>
			local.text === remote.text && (local.deletedAt ?? null) === (remote.deleted_at ?? null),
		onConflict: async (local, remote, helpers) => {
			if (local.updatedAt > remote.updated_at) return [await helpers.push(local)];
			return [
				{
					id: remote.id,
					userId: remote.user_id,
					text: remote.text,
					createdAt: remote.created_at,
					updatedAt: remote.updated_at,
					deletedAt: remote.deleted_at,
					lastSyncedAt:
						remote.deleted_at && remote.deleted_at > remote.updated_at
							? remote.deleted_at
							: remote.updated_at,
					lastRemoteChangeAt: remote.sync_updated_at
				}
			];
		}
	}).sync();
	return { ...result, items: await JourneyStorage.loadEntries(userId) };
}
