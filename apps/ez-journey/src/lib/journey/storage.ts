import { ANONYMOUS_USER_ID, type StoredJourneyEntry } from '../journey';

const DB_NAME = 'journey';
const DB_VERSION = 3;
const STORE_NAME = 'entries';
const SETTINGS_STORE_NAME = 'settings';
const USER_ID_INDEX = 'userId';
const USER_CREATED_INDEX = 'userCreatedAtId';

export type EntryCursor = { createdAt: string; id: string };
export type EntryPage = { entries: StoredJourneyEntry[]; nextCursor: EntryCursor | null };

type StorageBackend = {
	loadEntries(userId: string): Promise<StoredJourneyEntry[]>;
	loadPage(userId: string, before: EntryCursor | null, limit: number): Promise<EntryPage>;
	saveEntries(entries: StoredJourneyEntry[]): Promise<void>;
	saveSyncResults(
		userId: string,
		originalEntries: StoredJourneyEntry[],
		syncedEntries: StoredJourneyEntry[]
	): Promise<void>;
	claimAnonymousEntries(userId: string): Promise<void>;
	hasPromptedForAnonymousImport(userId: string): Promise<boolean>;
	markPromptedForAnonymousImport(userId: string): Promise<void>;
};

export class JourneyStorage {
	private static backendPromise: Promise<StorageBackend> | null = null;
	private static memoryBackend = createMemoryBackend();

	static async loadEntries(userId: string | null) {
		return (await this.backend()).loadEntries(userId ?? ANONYMOUS_USER_ID);
	}

	static async loadPage(userId: string | null, before: EntryCursor | null, limit = 30) {
		return (await this.backend()).loadPage(userId ?? ANONYMOUS_USER_ID, before, limit);
	}

	static async saveEntries(entries: StoredJourneyEntry[]) {
		return (await this.backend()).saveEntries(entries);
	}

	static async saveSyncResults(
		userId: string,
		originalEntries: StoredJourneyEntry[],
		syncedEntries: StoredJourneyEntry[]
	) {
		return (await this.backend()).saveSyncResults(userId, originalEntries, syncedEntries);
	}

	static async claimAnonymousEntries(userId: string) {
		return (await this.backend()).claimAnonymousEntries(userId);
	}

	static async hasPromptedForAnonymousImport(userId: string) {
		return (await this.backend()).hasPromptedForAnonymousImport(userId);
	}

	static async markPromptedForAnonymousImport(userId: string) {
		return (await this.backend()).markPromptedForAnonymousImport(userId);
	}

	static resetForTests() {
		this.backendPromise = null;
		this.memoryBackend = createMemoryBackend();
	}

	private static backend() {
		if (!this.backendPromise) {
			this.backendPromise =
				typeof indexedDB === 'undefined' ? Promise.resolve(this.memoryBackend) : openIndexedDb();
		}
		return this.backendPromise;
	}
}

function createMemoryBackend(): StorageBackend {
	const entries = new Map<string, StoredJourneyEntry>();
	const promptedUsers = new Set<string>();
	return {
		async loadEntries(userId) {
			return [...entries.values()]
				.filter((entry) => entry.userId === userId)
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
		},
		async loadPage(userId, before, limit) {
			const candidates = [...entries.values()]
				.filter((entry) => entry.userId === userId && (!before || compareCursor(entry, before) < 0))
				.sort(compareNewestFirst)
				.slice(0, limit + 1);
			return pageFromEntries(candidates, limit);
		},
		async saveEntries(nextEntries) {
			for (const entry of nextEntries) entries.set(entry.id, entry);
		},
		async saveSyncResults(userId, originalEntries, syncedEntries) {
			const originalById = new Map(originalEntries.map((entry) => [entry.id, entry]));
			const syncedById = new Map(syncedEntries.map((entry) => [entry.id, entry]));
			for (const [id, current] of entries) {
				if (current.userId !== userId) continue;
				const original = originalById.get(id);
				if (!original || !sameStoredEntry(current, original)) continue;
				const synced = syncedById.get(id);
				if (synced) entries.set(id, synced);
				else entries.delete(id);
			}
			for (const synced of syncedEntries) {
				if (
					synced.userId === userId &&
					!originalById.has(synced.id) &&
					!entries.has(synced.id)
				) {
					entries.set(synced.id, synced);
				}
			}
		},
		async claimAnonymousEntries(userId) {
			for (const [id, entry] of entries) {
				if (entry.userId === ANONYMOUS_USER_ID) entries.set(id, { ...entry, userId });
			}
		},
		async hasPromptedForAnonymousImport(userId) {
			return promptedUsers.has(userId);
		},
		async markPromptedForAnonymousImport(userId) {
			promptedUsers.add(userId);
		}
	};
}

function openIndexedDb(): Promise<StorageBackend> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			const store = db.objectStoreNames.contains(STORE_NAME)
				? request.transaction!.objectStore(STORE_NAME)
				: db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			if (!store.indexNames.contains(USER_ID_INDEX))
				store.createIndex(USER_ID_INDEX, USER_ID_INDEX);
			if (!store.indexNames.contains(USER_CREATED_INDEX)) {
				store.createIndex(USER_CREATED_INDEX, ['userId', 'createdAt', 'id']);
			}
			if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
				db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: ['userId', 'key'] });
			}
		};
		request.onerror = () => reject(request.error ?? new Error('Could not open Journey storage.'));
		request.onsuccess = () => {
			const db = request.result;
			resolve({
				loadEntries(userId) {
					return runTransaction(db, 'readonly', (store, setResult) => {
						const read = store.index(USER_ID_INDEX).getAll(userId);
						read.onsuccess = () =>
							setResult(
								(read.result as StoredJourneyEntry[]).sort(
									(a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
								)
							);
					});
				},
				loadPage(userId, before, limit) {
					return loadIndexedDbPage(db, userId, before, limit);
				},
				saveEntries(entries) {
					return runTransaction(db, 'readwrite', (store) => {
						for (const entry of entries) store.put(entry);
					});
				},
				saveSyncResults(userId, originalEntries, syncedEntries) {
					return runTransaction(db, 'readwrite', (store) => {
						const read = store.index(USER_ID_INDEX).getAll(userId);
						read.onsuccess = () => {
							const currentEntries = read.result as StoredJourneyEntry[];
							const currentById = new Map(currentEntries.map((entry) => [entry.id, entry]));
							const originalById = new Map(originalEntries.map((entry) => [entry.id, entry]));
							const syncedById = new Map(syncedEntries.map((entry) => [entry.id, entry]));
							for (const original of originalEntries) {
								const current = currentById.get(original.id);
								if (!current || !sameStoredEntry(current, original)) continue;
								const synced = syncedById.get(original.id);
								if (synced) store.put(synced);
								else store.delete(original.id);
							}
							for (const synced of syncedEntries) {
								if (
									synced.userId === userId &&
									!originalById.has(synced.id) &&
									!currentById.has(synced.id)
								) {
									store.put(synced);
								}
							}
						};
					});
				},
				claimAnonymousEntries(userId) {
					return runTransaction(db, 'readwrite', (store) => {
						const read = store.index(USER_ID_INDEX).getAll(ANONYMOUS_USER_ID);
						read.onsuccess = () => {
							for (const entry of read.result as StoredJourneyEntry[])
								store.put({ ...entry, userId });
						};
					});
				},
				hasPromptedForAnonymousImport(userId) {
					return runSettingsTransaction(db, 'readonly', (store, setResult) => {
						const read = store.get([userId, 'hasPromptedForAnonymousImport']);
						read.onsuccess = () => setResult(read.result?.value === true);
					});
				},
				markPromptedForAnonymousImport(userId) {
					return runSettingsTransaction(db, 'readwrite', (store) => {
						store.put({
							userId,
							key: 'hasPromptedForAnonymousImport',
							value: true,
							updatedAt: new Date().toISOString()
						});
					});
				}
			});
		};
	});
}

function runSettingsTransaction<T = void>(
	db: IDBDatabase,
	mode: IDBTransactionMode,
	start: (store: IDBObjectStore, setResult: (result: T) => void) => void
) {
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(SETTINGS_STORE_NAME, mode);
		let result: T;
		start(tx.objectStore(SETTINGS_STORE_NAME), (next) => (result = next));
		tx.oncomplete = () => resolve(result);
		tx.onerror = () => reject(tx.error ?? new Error('Journey settings transaction failed.'));
		tx.onabort = () => reject(tx.error ?? new Error('Journey settings transaction was aborted.'));
	});
}

function runTransaction<T = void>(
	db: IDBDatabase,
	mode: IDBTransactionMode,
	start: (store: IDBObjectStore, setResult: (result: T) => void) => void
) {
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, mode);
		let result: T;
		start(tx.objectStore(STORE_NAME), (next) => (result = next));
		tx.oncomplete = () => resolve(result);
		tx.onerror = () => reject(tx.error ?? new Error('Journey storage transaction failed.'));
		tx.onabort = () => reject(tx.error ?? new Error('Journey storage transaction was aborted.'));
	});
}

function loadIndexedDbPage(
	db: IDBDatabase,
	userId: string,
	before: EntryCursor | null,
	limit: number
) {
	return new Promise<EntryPage>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const index = tx.objectStore(STORE_NAME).index(USER_CREATED_INDEX);
		const lower: IDBValidKey = [userId, '', ''];
		const upper: IDBValidKey = before
			? [userId, before.createdAt, before.id]
			: [userId, '\uffff', '\uffff'];
		const request = index.openCursor(
			IDBKeyRange.bound(lower, upper, false, Boolean(before)),
			'prev'
		);
		const entries: StoredJourneyEntry[] = [];
		let page: EntryPage = { entries: [], nextCursor: null };
		request.onsuccess = () => {
			const cursor = request.result;
			if (cursor) {
				entries.push(cursor.value as StoredJourneyEntry);
				if (entries.length <= limit) cursor.continue();
			}
			if (!cursor || entries.length > limit) page = pageFromEntries(entries, limit);
		};
		tx.oncomplete = () => resolve(page);
		tx.onerror = () => reject(tx.error ?? new Error('Journey page query failed.'));
		tx.onabort = () => reject(tx.error ?? new Error('Journey page query was aborted.'));
	});
}

function pageFromEntries(entries: StoredJourneyEntry[], limit: number): EntryPage {
	const hasMore = entries.length > limit;
	const page = entries.slice(0, limit);
	const last = page.at(-1);
	return {
		entries: page,
		nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null
	};
}

function compareNewestFirst(a: StoredJourneyEntry, b: StoredJourneyEntry) {
	return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

function compareCursor(entry: StoredJourneyEntry, cursor: EntryCursor) {
	return entry.createdAt.localeCompare(cursor.createdAt) || entry.id.localeCompare(cursor.id);
}

function sameStoredEntry(left: StoredJourneyEntry, right: StoredJourneyEntry) {
	return (
		left.id === right.id &&
		left.userId === right.userId &&
		left.text === right.text &&
		left.createdAt === right.createdAt &&
		left.updatedAt === right.updatedAt &&
		left.deletedAt === right.deletedAt &&
		(left.lastSyncedAt ?? null) === (right.lastSyncedAt ?? null) &&
		(left.lastRemoteChangeAt ?? null) === (right.lastRemoteChangeAt ?? null)
	);
}
