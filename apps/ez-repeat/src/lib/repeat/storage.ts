import { createMockRepeatData } from './mock-data';
import type { Completion, Habit, RepeatSnapshot } from './types';

const REPEAT_DB_NAME = 'repeat';
const REPEAT_DB_VERSION = 1;
const HABITS_STORE_NAME = 'habits';
const COMPLETIONS_STORE_NAME = 'completions';
const SETTINGS_STORE_NAME = 'settings';
const HABIT_ID_INDEX = 'habitId';
const COMPLETED_AT_INDEX = 'completedAt';

interface SettingRecord {
	key: string;
	value: unknown;
	updatedAt: string;
}

interface StorageBackend {
	resetWithMockData(): Promise<void>;
	loadSnapshot(): Promise<RepeatSnapshot>;
	addHabit(habit: Habit): Promise<void>;
	archiveHabit(habitId: string, archivedAt: string): Promise<void>;
	deleteHabit(habitId: string): Promise<void>;
	addCompletion(completion: Completion): Promise<void>;
	deleteLatestCompletion(habitId: string, startDate: string, endDate: string): Promise<void>;
	getSetting<T>(key: string): Promise<T | undefined>;
	setSetting(key: string, value: unknown): Promise<void>;
}

export class RepeatStorage {
	private static backendPromise: Promise<StorageBackend> | null = null;
	private static memoryBackend = createMemoryBackend();

	static async resetWithMockData() {
		const backend = await this.getBackend();
		await backend.resetWithMockData();
	}

	static async loadSnapshot() {
		const backend = await this.getBackend();
		return backend.loadSnapshot();
	}

	static async addHabit(habit: Habit) {
		const backend = await this.getBackend();
		await backend.addHabit(habit);
	}

	static async archiveHabit(habitId: string, archivedAt: string) {
		const backend = await this.getBackend();
		await backend.archiveHabit(habitId, archivedAt);
	}

	static async deleteHabit(habitId: string) {
		const backend = await this.getBackend();
		await backend.deleteHabit(habitId);
	}

	static async addCompletion(completion: Completion) {
		const backend = await this.getBackend();
		await backend.addCompletion(completion);
	}

	static async deleteLatestCompletion(habitId: string, startDate: string, endDate: string) {
		const backend = await this.getBackend();
		await backend.deleteLatestCompletion(habitId, startDate, endDate);
	}

	static async getSetting<T>(key: string) {
		const backend = await this.getBackend();
		return backend.getSetting<T>(key);
	}

	static async setSetting(key: string, value: unknown) {
		const backend = await this.getBackend();
		await backend.setSetting(key, value);
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

function createMemoryBackend(): StorageBackend {
	const habits = new Map<string, Habit>();
	const completions = new Map<string, Completion>();
	const settings = new Map<string, SettingRecord>();

	return {
		async resetWithMockData() {
			const data = createMockRepeatData();
			habits.clear();
			completions.clear();
			for (const habit of data.habits) {
				habits.set(habit.id, habit);
			}
			for (const completion of data.completions) {
				completions.set(completion.id, completion);
			}
		},
		async loadSnapshot() {
			return {
				habits: [...habits.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
				completions: [...completions.values()]
			};
		},
		async addHabit(habit) {
			habits.set(habit.id, habit);
		},
		async archiveHabit(habitId, archivedAt) {
			const habit = habits.get(habitId);
			if (habit) {
				habits.set(habitId, { ...habit, archivedAt });
			}
		},
		async deleteHabit(habitId) {
			habits.delete(habitId);
			for (const completion of [...completions.values()]) {
				if (completion.habitId === habitId) {
					completions.delete(completion.id);
				}
			}
		},
		async addCompletion(completion) {
			completions.set(completion.id, completion);
		},
		async deleteLatestCompletion(habitId, startDate, endDate) {
			const latest = [...completions.values()]
				.filter(
					(completion) =>
						completion.habitId === habitId &&
						completion.completedAt >= startDate &&
						completion.completedAt <= endDate
				)
				.sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0];
			if (latest) {
				completions.delete(latest.id);
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
		async resetWithMockData() {
			const data = createMockRepeatData();
			const tx = db.transaction(
				[HABITS_STORE_NAME, COMPLETIONS_STORE_NAME, SETTINGS_STORE_NAME],
				'readwrite'
			);
			const habitsStore = tx.objectStore(HABITS_STORE_NAME);
			const completionsStore = tx.objectStore(COMPLETIONS_STORE_NAME);
			habitsStore.clear();
			completionsStore.clear();
			for (const habit of data.habits) {
				habitsStore.put(habit);
			}
			for (const completion of data.completions) {
				completionsStore.put(completion);
			}
			await transactionToPromise(tx);
		},
		async loadSnapshot() {
			const tx = db.transaction([HABITS_STORE_NAME, COMPLETIONS_STORE_NAME], 'readonly');
			const [habits, completions] = await Promise.all([
				requestToPromise<Habit[]>(tx.objectStore(HABITS_STORE_NAME).getAll()),
				requestToPromise<Completion[]>(tx.objectStore(COMPLETIONS_STORE_NAME).getAll())
			]);
			await transactionToPromise(tx);
			return {
				habits: habits.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
				completions
			};
		},
		async addHabit(habit) {
			const tx = db.transaction(HABITS_STORE_NAME, 'readwrite');
			tx.objectStore(HABITS_STORE_NAME).put(habit);
			await transactionToPromise(tx);
		},
		async archiveHabit(habitId, archivedAt) {
			const tx = db.transaction(HABITS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(HABITS_STORE_NAME);
			const habit = await requestToPromise<Habit | undefined>(store.get(habitId));
			if (habit) {
				store.put({ ...habit, archivedAt });
			}
			await transactionToPromise(tx);
		},
		async deleteHabit(habitId) {
			const tx = db.transaction([HABITS_STORE_NAME, COMPLETIONS_STORE_NAME], 'readwrite');
			tx.objectStore(HABITS_STORE_NAME).delete(habitId);
			const completionsStore = tx.objectStore(COMPLETIONS_STORE_NAME);
			const matches = await requestToPromise<Completion[]>(
				completionsStore.index(HABIT_ID_INDEX).getAll(habitId)
			);
			for (const completion of matches) {
				completionsStore.delete(completion.id);
			}
			await transactionToPromise(tx);
		},
		async addCompletion(completion) {
			const tx = db.transaction(COMPLETIONS_STORE_NAME, 'readwrite');
			tx.objectStore(COMPLETIONS_STORE_NAME).put(completion);
			await transactionToPromise(tx);
		},
		async deleteLatestCompletion(habitId, startDate, endDate) {
			const tx = db.transaction(COMPLETIONS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(COMPLETIONS_STORE_NAME);
			const matches = await requestToPromise<Completion[]>(
				store.index(HABIT_ID_INDEX).getAll(habitId)
			);
			const latest = matches
				.filter((completion) => completion.completedAt >= startDate && completion.completedAt <= endDate)
				.sort((left, right) => right.completedAt.localeCompare(left.completedAt))[0];
			if (latest) {
				store.delete(latest.id);
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
				db.createObjectStore(HABITS_STORE_NAME, { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains(COMPLETIONS_STORE_NAME)) {
				const completionsStore = db.createObjectStore(COMPLETIONS_STORE_NAME, { keyPath: 'id' });
				completionsStore.createIndex(HABIT_ID_INDEX, 'habitId', { unique: false });
				completionsStore.createIndex(COMPLETED_AT_INDEX, 'completedAt', { unique: false });
			}
			if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
				db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'key' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
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
