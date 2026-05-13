import type { Completion, Habit, RepeatSnapshot } from './types';

const REPEAT_DB_NAME = 'repeat';
const REPEAT_DB_VERSION = 3;
const HABITS_STORE_NAME = 'habits';
const COMPLETIONS_STORE_NAME = 'completions';
const SETTINGS_STORE_NAME = 'settings';
const USER_ID_INDEX = 'userId';
const UPDATED_AT_INDEX = 'updatedAt';
const HABIT_ID_INDEX = 'habitId';
const COMPLETED_ON_INDEX = 'completedOn';
const LEGACY_MOCK_HABIT_IDS = new Set([
	'habit-morning-stretch',
	'habit-read',
	'habit-lift',
	'habit-call-mom',
	'habit-old-journal'
]);

interface SettingRecord {
	key: string;
	value: unknown;
	updatedAt: string;
}

interface StorageBackend {
	loadSnapshot(userId?: string | null): Promise<RepeatSnapshot>;
	saveHabits(habits: Habit[]): Promise<void>;
	saveCompletions(completions: Completion[]): Promise<void>;
	addHabit(habit: Habit): Promise<void>;
	archiveHabit(habitId: string, archivedAt: string, updatedAt: string): Promise<void>;
	deleteHabit(habitId: string, deletedAt: string): Promise<void>;
	incrementCompletion(completion: Completion, maxCount: number): Promise<void>;
	decrementCompletion(habitId: string, completedOn: string, updatedAt: string): Promise<void>;
	getSetting<T>(key: string): Promise<T | undefined>;
	setSetting(key: string, value: unknown): Promise<void>;
}

export class RepeatStorage {
	private static backendPromise: Promise<StorageBackend> | null = null;
	private static memoryBackend = createMemoryBackend();

	static async loadSnapshot(userId?: string | null) {
		const backend = await this.getBackend();
		return backend.loadSnapshot(userId);
	}

	static async saveHabits(habits: Habit[]) {
		const backend = await this.getBackend();
		await backend.saveHabits(habits);
		notifyRepeatStorageChanged();
	}

	static async saveCompletions(completions: Completion[]) {
		const backend = await this.getBackend();
		await backend.saveCompletions(completions);
		notifyRepeatStorageChanged();
	}

	static async addHabit(habit: Habit) {
		const backend = await this.getBackend();
		await backend.addHabit(habit);
		notifyRepeatStorageChanged();
	}

	static async archiveHabit(
		habitId: string,
		archivedAt: string,
		updatedAt = new Date().toISOString()
	) {
		const backend = await this.getBackend();
		await backend.archiveHabit(habitId, archivedAt, updatedAt);
		notifyRepeatStorageChanged();
	}

	static async deleteHabit(habitId: string, deletedAt: string) {
		const backend = await this.getBackend();
		await backend.deleteHabit(habitId, deletedAt);
		notifyRepeatStorageChanged();
	}

	static async incrementCompletion(completion: Completion, maxCount: number) {
		const backend = await this.getBackend();
		await backend.incrementCompletion(completion, maxCount);
		notifyRepeatStorageChanged();
	}

	static async decrementCompletion(habitId: string, completedOn: string, updatedAt: string) {
		const backend = await this.getBackend();
		await backend.decrementCompletion(habitId, completedOn, updatedAt);
		notifyRepeatStorageChanged();
	}

	static async getSetting<T>(key: string) {
		const backend = await this.getBackend();
		return backend.getSetting<T>(key);
	}

	static async setSetting(key: string, value: unknown) {
		const backend = await this.getBackend();
		await backend.setSetting(key, value);
		notifyRepeatStorageChanged();
	}

	static resetForTests() {
		this.backendPromise = null;
		this.memoryBackend = createMemoryBackend();
	}

	private static async getBackend() {
		if (!this.backendPromise) {
			this.backendPromise =
				typeof indexedDB === 'undefined'
					? Promise.resolve(this.memoryBackend)
					: createIndexedDbBackend();
		}

		return this.backendPromise;
	}
}

export const REPEAT_STORAGE_CHANGED_EVENT = 'ez-repeat-storage-changed';
export const REPEAT_STORAGE_CHANNEL_NAME = 'ez-repeat-storage';

export function notifyRepeatStorageChanged() {
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent(REPEAT_STORAGE_CHANGED_EVENT));
	}
	if (typeof BroadcastChannel !== 'undefined') {
		const channel = new BroadcastChannel(REPEAT_STORAGE_CHANNEL_NAME);
		channel.postMessage({ type: 'changed' });
		channel.close();
	}
}

function createMemoryBackend(): StorageBackend {
	const habits = new Map<string, Habit>();
	const completions = new Map<string, Completion>();
	const settings = new Map<string, SettingRecord>();

	return {
		async loadSnapshot(userId) {
			return {
				habits: [...habits.values()]
					.filter((habit) => !userId || habit.userId === userId)
					.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
				completions: [...completions.values()].filter(
					(completion) => !userId || completion.userId === userId
				)
			};
		},
		async saveHabits(nextHabits) {
			for (const habit of nextHabits) {
				habits.set(habit.id, habit);
			}
		},
		async saveCompletions(nextCompletions) {
			for (const completion of nextCompletions) {
				completions.set(completionKey(completion.habitId, completion.completedOn), completion);
			}
		},
		async addHabit(habit) {
			habits.set(habit.id, habit);
		},
		async archiveHabit(habitId, archivedAt, updatedAt) {
			const habit = habits.get(habitId);
			if (habit) {
				habits.set(habitId, { ...habit, archivedAt, updatedAt });
			}
		},
		async deleteHabit(habitId, deletedAt) {
			const habit = habits.get(habitId);
			if (habit) {
				habits.set(habitId, { ...habit, deletedAt, updatedAt: deletedAt });
			}
		},
		async incrementCompletion(completion, maxCount) {
			const key = completionKey(completion.habitId, completion.completedOn);
			const existing = completions.get(key);
			completions.set(key, {
				...(existing ?? completion),
				count: Math.min(maxCount, (existing?.count ?? 0) + 1),
				updatedAt: completion.updatedAt,
				lastSyncedAt: existing?.lastSyncedAt ?? null
			});
		},
		async decrementCompletion(habitId, completedOn, updatedAt) {
			const key = completionKey(habitId, completedOn);
			const existing = completions.get(key);
			if (existing) {
				completions.set(key, {
					...existing,
					count: Math.max(0, existing.count - 1),
					updatedAt
				});
			}
		},
		async getSetting<T>(key: string) {
			return settings.get(key)?.value as T | undefined;
		},
		async setSetting(key, value) {
			settings.set(key, { key, value, updatedAt: new Date().toISOString() });
		}
	};
}

async function createIndexedDbBackend(): Promise<StorageBackend> {
	const db = await openDatabase();

	return {
		async loadSnapshot(userId) {
			const tx = db.transaction([HABITS_STORE_NAME, COMPLETIONS_STORE_NAME], 'readonly');
			const [habits, completions] = await Promise.all([
				getAllForUser<Habit>(tx.objectStore(HABITS_STORE_NAME), userId),
				getAllForUser<Completion>(tx.objectStore(COMPLETIONS_STORE_NAME), userId)
			]);
			await transactionToPromise(tx);
			return {
				habits: habits.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
				completions
			};
		},
		async saveHabits(habits) {
			const tx = db.transaction(HABITS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(HABITS_STORE_NAME);
			for (const habit of habits) {
				store.put(habit);
			}
			await transactionToPromise(tx);
		},
		async saveCompletions(completions) {
			const tx = db.transaction(COMPLETIONS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(COMPLETIONS_STORE_NAME);
			for (const completion of completions) {
				store.put(completion);
			}
			await transactionToPromise(tx);
		},
		async addHabit(habit) {
			const tx = db.transaction(HABITS_STORE_NAME, 'readwrite');
			tx.objectStore(HABITS_STORE_NAME).put(habit);
			await transactionToPromise(tx);
		},
		async archiveHabit(habitId, archivedAt, updatedAt) {
			const tx = db.transaction(HABITS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(HABITS_STORE_NAME);
			const habit = await requestToPromise<Habit | undefined>(store.get(habitId));
			if (habit) {
				store.put({ ...habit, archivedAt, updatedAt });
			}
			await transactionToPromise(tx);
		},
		async deleteHabit(habitId, deletedAt) {
			const tx = db.transaction(HABITS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(HABITS_STORE_NAME);
			const habit = await requestToPromise<Habit | undefined>(store.get(habitId));
			if (habit) {
				store.put({ ...habit, deletedAt, updatedAt: deletedAt });
			}
			await transactionToPromise(tx);
		},
		async incrementCompletion(completion, maxCount) {
			const tx = db.transaction(COMPLETIONS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(COMPLETIONS_STORE_NAME);
			const key = [completion.habitId, completion.completedOn];
			const existing = await requestToPromise<Completion | undefined>(store.get(key));
			store.put({
				...(existing ?? completion),
				count: Math.min(maxCount, (existing?.count ?? 0) + 1),
				updatedAt: completion.updatedAt,
				lastSyncedAt: existing?.lastSyncedAt ?? null
			});
			await transactionToPromise(tx);
		},
		async decrementCompletion(habitId, completedOn, updatedAt) {
			const tx = db.transaction(COMPLETIONS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(COMPLETIONS_STORE_NAME);
			const key = [habitId, completedOn];
			const existing = await requestToPromise<Completion | undefined>(store.get(key));
			if (existing) {
				store.put({
					...existing,
					count: Math.max(0, existing.count - 1),
					updatedAt
				});
			}
			await transactionToPromise(tx);
		},
		async getSetting<T>(key: string) {
			const tx = db.transaction(SETTINGS_STORE_NAME, 'readonly');
			const setting = await requestToPromise<SettingRecord | undefined>(
				tx.objectStore(SETTINGS_STORE_NAME).get(key)
			);
			await transactionToPromise(tx);
			return setting?.value as T | undefined;
		},
		async setSetting(key, value) {
			const tx = db.transaction(SETTINGS_STORE_NAME, 'readwrite');
			tx.objectStore(SETTINGS_STORE_NAME).put({ key, value, updatedAt: new Date().toISOString() });
			await transactionToPromise(tx);
		}
	};
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(REPEAT_DB_NAME, REPEAT_DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(HABITS_STORE_NAME)) {
				const habitsStore = db.createObjectStore(HABITS_STORE_NAME, { keyPath: 'id' });
				habitsStore.createIndex(USER_ID_INDEX, 'userId', { unique: false });
				habitsStore.createIndex(UPDATED_AT_INDEX, 'updatedAt', { unique: false });
			}
			if (db.objectStoreNames.contains(COMPLETIONS_STORE_NAME)) {
				db.deleteObjectStore(COMPLETIONS_STORE_NAME);
			}
			const completionsStore = db.createObjectStore(COMPLETIONS_STORE_NAME, {
				keyPath: ['habitId', 'completedOn']
			});
			completionsStore.createIndex(USER_ID_INDEX, 'userId', { unique: false });
			completionsStore.createIndex(UPDATED_AT_INDEX, 'updatedAt', { unique: false });
			completionsStore.createIndex(HABIT_ID_INDEX, 'habitId', { unique: false });
			completionsStore.createIndex(COMPLETED_ON_INDEX, 'completedOn', { unique: false });

			if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
				db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'key' });
			}
		};
		request.onsuccess = async () => {
			const db = request.result;
			try {
				await removeLegacyMockData(db);
				resolve(db);
			} catch (error) {
				db.close();
				reject(error);
			}
		};
		request.onerror = () => reject(request.error);
	});
}

function completionKey(habitId: string, completedOn: string) {
	return `${habitId}::${completedOn}`;
}

function getAllForUser<T extends { userId: string }>(
	store: IDBObjectStore,
	userId?: string | null
): Promise<T[]> {
	if (!userId) {
		return requestToPromise<T[]>(store.getAll());
	}

	return requestToPromise<T[]>(store.index(USER_ID_INDEX).getAll(userId));
}

async function removeLegacyMockData(db: IDBDatabase) {
	const tx = db.transaction([HABITS_STORE_NAME, COMPLETIONS_STORE_NAME], 'readwrite');
	const habitsStore = tx.objectStore(HABITS_STORE_NAME);
	const completionsStore = tx.objectStore(COMPLETIONS_STORE_NAME);

	for (const habitId of LEGACY_MOCK_HABIT_IDS) {
		habitsStore.delete(habitId);
		const index = completionsStore.index(HABIT_ID_INDEX);
		const cursorRequest = index.openCursor(IDBKeyRange.only(habitId));
		cursorRequest.onsuccess = () => {
			const cursor = cursorRequest.result;
			if (!cursor) {
				return;
			}
			cursor.delete();
			cursor.continue();
		};
	}

	await transactionToPromise(tx);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
	});
}
