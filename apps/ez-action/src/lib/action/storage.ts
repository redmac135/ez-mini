import type { ActionList, ActionSnapshot, ActionTask, ThemeMode } from './types';

const ACTION_DB_NAME = 'action';
const ACTION_DB_VERSION = 1;
const LISTS_STORE_NAME = 'lists';
const TASKS_STORE_NAME = 'tasks';
const SETTINGS_STORE_NAME = 'settings';
const USER_ID_INDEX = 'userId';
const CREATED_AT_INDEX = 'createdAt';

interface SettingRecord {
	key: string;
	value: unknown;
	updatedAt: string;
}

interface StorageBackend {
	loadSnapshot(userId?: string | null): Promise<ActionSnapshot>;
	saveLists(lists: ActionList[]): Promise<void>;
	saveTasks(tasks: ActionTask[]): Promise<void>;
	putList(list: ActionList): Promise<void>;
	putTask(task: ActionTask): Promise<void>;
	putTasks(tasks: ActionTask[]): Promise<void>;
	getSetting<T>(key: string): Promise<T | undefined>;
	setSetting(key: string, value: unknown): Promise<void>;
}

export class ActionStorage {
	private static backendPromise: Promise<StorageBackend> | null = null;
	private static memoryBackend = createMemoryBackend();

	static async loadSnapshot(userId?: string | null) {
		const backend = await this.getBackend();
		return backend.loadSnapshot(userId);
	}

	static async saveLists(lists: ActionList[]) {
		const backend = await this.getBackend();
		await backend.saveLists(lists);
		notifyActionStorageChanged();
	}

	static async saveTasks(tasks: ActionTask[]) {
		const backend = await this.getBackend();
		await backend.saveTasks(tasks);
		notifyActionStorageChanged();
	}

	static async putList(list: ActionList) {
		const backend = await this.getBackend();
		await backend.putList(list);
		notifyActionStorageChanged();
	}

	static async putTask(task: ActionTask) {
		const backend = await this.getBackend();
		await backend.putTask(task);
		notifyActionStorageChanged();
	}

	static async putTasks(tasks: ActionTask[]) {
		const backend = await this.getBackend();
		await backend.putTasks(tasks);
		notifyActionStorageChanged();
	}

	static async getSetting<T>(key: string) {
		const backend = await this.getBackend();
		return backend.getSetting<T>(key);
	}

	static async setSetting(key: string, value: unknown) {
		const backend = await this.getBackend();
		await backend.setSetting(key, value);
		notifyActionStorageChanged();
	}

	static async getThemeMode() {
		return (
			(await this.getSetting<ThemeMode>('themeMode')) === 'dark' ? 'dark' : 'light'
		) as ThemeMode;
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

export const ACTION_STORAGE_CHANGED_EVENT = 'ez-action-storage-changed';
export const ACTION_STORAGE_CHANNEL_NAME = 'ez-action-storage';

export function notifyActionStorageChanged() {
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent(ACTION_STORAGE_CHANGED_EVENT));
	}
	if (typeof BroadcastChannel !== 'undefined') {
		const channel = new BroadcastChannel(ACTION_STORAGE_CHANNEL_NAME);
		channel.postMessage({ type: 'changed' });
		channel.close();
	}
}

function createMemoryBackend(): StorageBackend {
	const lists = new Map<string, ActionList>();
	const tasks = new Map<string, ActionTask>();
	const settings = new Map<string, SettingRecord>();

	return {
		async loadSnapshot(userId) {
			return {
				lists: [...lists.values()]
					.filter((list) => !userId || list.userId === userId)
					.sort(byCreatedAt),
				tasks: [...tasks.values()]
					.filter((task) => !userId || task.userId === userId)
					.sort(byCreatedAt)
			};
		},
		async saveLists(nextLists) {
			for (const list of nextLists) lists.set(list.id, list);
		},
		async saveTasks(nextTasks) {
			for (const task of nextTasks) tasks.set(task.id, task);
		},
		async putList(list) {
			lists.set(list.id, list);
		},
		async putTask(task) {
			tasks.set(task.id, task);
		},
		async putTasks(nextTasks) {
			for (const task of nextTasks) tasks.set(task.id, task);
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
			const tx = db.transaction([LISTS_STORE_NAME, TASKS_STORE_NAME], 'readonly');
			const [lists, tasks] = await Promise.all([
				getAllForUser<ActionList>(tx.objectStore(LISTS_STORE_NAME), userId),
				getAllForUser<ActionTask>(tx.objectStore(TASKS_STORE_NAME), userId)
			]);
			await transactionToPromise(tx);
			return { lists: lists.sort(byCreatedAt), tasks: tasks.sort(byCreatedAt) };
		},
		async saveLists(lists) {
			const tx = db.transaction(LISTS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(LISTS_STORE_NAME);
			for (const list of lists) store.put(list);
			await transactionToPromise(tx);
		},
		async saveTasks(tasks) {
			const tx = db.transaction(TASKS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(TASKS_STORE_NAME);
			for (const task of tasks) store.put(task);
			await transactionToPromise(tx);
		},
		async putList(list) {
			const tx = db.transaction(LISTS_STORE_NAME, 'readwrite');
			tx.objectStore(LISTS_STORE_NAME).put(list);
			await transactionToPromise(tx);
		},
		async putTask(task) {
			const tx = db.transaction(TASKS_STORE_NAME, 'readwrite');
			tx.objectStore(TASKS_STORE_NAME).put(task);
			await transactionToPromise(tx);
		},
		async putTasks(tasks) {
			const tx = db.transaction(TASKS_STORE_NAME, 'readwrite');
			const store = tx.objectStore(TASKS_STORE_NAME);
			for (const task of tasks) store.put(task);
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
		const request = indexedDB.open(ACTION_DB_NAME, ACTION_DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(LISTS_STORE_NAME)) {
				const store = db.createObjectStore(LISTS_STORE_NAME, { keyPath: 'id' });
				store.createIndex(USER_ID_INDEX, 'userId');
				store.createIndex(CREATED_AT_INDEX, 'createdAt');
			}
			if (!db.objectStoreNames.contains(TASKS_STORE_NAME)) {
				const store = db.createObjectStore(TASKS_STORE_NAME, { keyPath: 'id' });
				store.createIndex(USER_ID_INDEX, 'userId');
				store.createIndex(CREATED_AT_INDEX, 'createdAt');
			}
			if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
				db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'key' });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function getAllForUser<T extends { userId: string }>(
	store: IDBObjectStore,
	userId?: string | null
) {
	if (!userId) return requestToPromise<T[]>(store.getAll());
	return requestToPromise<T[]>(store.index(USER_ID_INDEX).getAll(IDBKeyRange.only(userId)));
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function transactionToPromise(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

function byCreatedAt(left: { createdAt: string }, right: { createdAt: string }) {
	return left.createdAt.localeCompare(right.createdAt);
}
