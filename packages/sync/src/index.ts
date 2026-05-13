export interface SyncRequestOptions {
	showSuccessNotice: boolean;
}

export type AppSyncStatus = 'offline' | 'syncing' | 'synced' | 'saved_locally' | 'error';

export function getSyncStatusLabel(status: AppSyncStatus) {
	switch (status) {
		case 'offline':
			return 'Offline';
		case 'syncing':
			return 'Syncing…';
		case 'synced':
			return 'Synced';
		case 'saved_locally':
			return 'Saved locally';
		case 'error':
			return 'Sync error';
	}
}

interface TimerApi {
	setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
	clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

interface CreateSyncControllerOptions {
	delayMs: number;
	runSync: (options: SyncRequestOptions) => Promise<void>;
	timer?: TimerApi;
}

export interface SyncController {
	scheduleDebounced(): void;
	requestImmediate(options?: Partial<SyncRequestOptions>): void;
	queueFollowUp(options?: Partial<SyncRequestOptions>): void;
	cancel(): void;
}

const DEFAULT_OPTIONS: SyncRequestOptions = {
	showSuccessNotice: false
};

export function createSyncController(options: CreateSyncControllerOptions): SyncController {
	const timer = options.timer ?? globalThis;
	let syncBusy = false;
	let pendingAfterCurrent = false;
	let pendingShowSuccessNotice = false;
	let debouncedSyncTimeout: ReturnType<typeof setTimeout> | null = null;

	function normalizeOptions(input?: Partial<SyncRequestOptions>): SyncRequestOptions {
		return {
			...DEFAULT_OPTIONS,
			...input
		};
	}

	function clearScheduledSync() {
		if (debouncedSyncTimeout) {
			timer.clearTimeout(debouncedSyncTimeout);
			debouncedSyncTimeout = null;
		}
	}

	function requestSync(requestOptions: SyncRequestOptions) {
		if (syncBusy) {
			pendingAfterCurrent = true;
			pendingShowSuccessNotice ||= requestOptions.showSuccessNotice;
			return;
		}

		void runSync(requestOptions);
	}

	async function runSync(requestOptions: SyncRequestOptions) {
		syncBusy = true;

		try {
			await options.runSync(requestOptions);
		} finally {
			syncBusy = false;
			if (pendingAfterCurrent) {
				const showSuccessNotice = pendingShowSuccessNotice;
				pendingAfterCurrent = false;
				pendingShowSuccessNotice = false;
				void runSync({ showSuccessNotice });
			}
		}
	}

	return {
		scheduleDebounced() {
			clearScheduledSync();
			debouncedSyncTimeout = timer.setTimeout(() => {
				debouncedSyncTimeout = null;
				requestSync(DEFAULT_OPTIONS);
			}, options.delayMs);
		},
		requestImmediate(input) {
			clearScheduledSync();
			requestSync(normalizeOptions(input));
		},
		queueFollowUp(input) {
			requestSync(normalizeOptions(input));
		},
		cancel() {
			clearScheduledSync();
		}
	};
}

export interface SyncMetadata {
	id: string;
	updatedAt: string;
	deletedAt: string | null;
	lastSyncedAt: string | null;
	lastKnownRemoteUpdatedAt?: string | null;
	lastKnownRemoteDeletedAt?: string | null;
}

export interface RemoteMetadata {
	id: string;
	updated_at: string;
	deleted_at: string | null;
}

export interface ConflictHelpers<Local> {
	push(local: Local): Promise<Local>;
}

export interface SyncEngineConfig<Local, Remote> {
	pull(since: string | null): Promise<Remote[]>;
	push(item: Remote): Promise<Remote>;
	getLocal(): Promise<Local[]>;
	saveLocal(items: Local[]): Promise<void>;
	toRemote(local: Local): Remote;
	toLocal(remote: Remote, existing?: Local | null): Local;
	getId(item: Local | Remote): string;
	getSince(localItems: Local[]): string | null;
	getLocalUpdatedAt(local: Local): string;
	getRemoteUpdatedAt(remote: Remote): string;
	getLocalDeletedAt(local: Local): string | null;
	getRemoteDeletedAt(remote: Remote): string | null;
	getLastSyncedAt(local: Local): string | null;
	setLastSyncedAt(local: Local, value: string): Local;
	shouldSync?(local: Local): boolean;
	shouldKeepRemote?(remote: Remote): boolean;
	areStatesEqual?(local: Local, remote: Remote): boolean;
	onConflict?(local: Local, remote: Remote, helpers: ConflictHelpers<Local>): Promise<Local[]>;
}

export interface SyncResult<Local> {
	items: Local[];
	pushed: number;
	pulled: number;
	conflicts: number;
	pushedIds: string[];
	pulledIds: string[];
	conflictIds: string[];
}

export interface SyncEngine<Local> {
	sync(): Promise<SyncResult<Local>>;
	isSyncInProgress(): boolean;
}

export function createSyncEngine<Local, Remote>(
	config: SyncEngineConfig<Local, Remote>
): SyncEngine<Local> {
	let syncInProgress = false;

	function remoteShouldExistLocally(remote: Remote) {
		return config.shouldKeepRemote ? config.shouldKeepRemote(remote) : true;
	}

	function latestLocalMutationAt(local: Local) {
		const deletedAt = config.getLocalDeletedAt(local);
		const updatedAt = config.getLocalUpdatedAt(local);
		return deletedAt && deletedAt > updatedAt ? deletedAt : updatedAt;
	}

	function latestRemoteMutationAt(remote: Remote) {
		const deletedAt = config.getRemoteDeletedAt(remote);
		const updatedAt = config.getRemoteUpdatedAt(remote);
		return deletedAt && deletedAt > updatedAt ? deletedAt : updatedAt;
	}

	function hasLocalChangedSinceSync(local: Local) {
		const lastSyncedAt = config.getLastSyncedAt(local);
		return lastSyncedAt === null || latestLocalMutationAt(local) > lastSyncedAt;
	}

	function hasRemoteChangedSinceSync(local: Local, remote: Remote) {
		const lastSyncedAt = config.getLastSyncedAt(local);
		return lastSyncedAt === null || latestRemoteMutationAt(remote) > lastSyncedAt;
	}

	function toSyncedLocal(remote: Remote, existing?: Local | null) {
		return config.setLastSyncedAt(
			config.toLocal(remote, existing ?? null),
			config.getRemoteUpdatedAt(remote)
		);
	}

	return {
		isSyncInProgress() {
			return syncInProgress;
		},
		async sync() {
			if (syncInProgress) {
				throw new Error('Sync already in progress.');
			}

			syncInProgress = true;

			try {
				const localItems = await config.getLocal();
				const remoteSnapshot = await config.pull(config.getSince(localItems));
				const remoteById = new Map(remoteSnapshot.map((remote) => [config.getId(remote), remote]));
				const processedRemoteIds = new Set<string>();
				const nextItems: Local[] = [];
				const pushedIds: string[] = [];
				const pulledIds: string[] = [];
				const conflictIds: string[] = [];
				let pushed = 0;
				let pulled = 0;
				let conflicts = 0;

				async function pushLocal(local: Local) {
					const pushedRemote = await config.push(config.toRemote(local));
					const pushedLocal = toSyncedLocal(pushedRemote, local);
					pushed += 1;
					pushedIds.push(config.getId(pushedLocal));
					return pushedLocal;
				}

				for (const local of localItems) {
					if (config.shouldSync && !config.shouldSync(local)) {
						nextItems.push(local);
						continue;
					}

					const localId = config.getId(local);
					const remote = remoteById.get(localId) ?? null;

					if (!remote) {
						if (config.getLocalDeletedAt(local) !== null) {
							continue;
						}

						nextItems.push(await pushLocal(local));
						continue;
					}

					processedRemoteIds.add(config.getId(remote));

					const localChanged = hasLocalChangedSinceSync(local);
					const remoteChanged = hasRemoteChangedSinceSync(local, remote);
					const sameState = config.areStatesEqual ? config.areStatesEqual(local, remote) : false;

					if (!localChanged && !remoteChanged) {
						if (remoteShouldExistLocally(remote)) {
							nextItems.push(toSyncedLocal(remote, local));
						}
						continue;
					}

					if (sameState) {
						if (remoteShouldExistLocally(remote)) {
							nextItems.push(toSyncedLocal(remote, local));
						}
						continue;
					}

					if (localChanged && !remoteChanged) {
						nextItems.push(await pushLocal(local));
						continue;
					}

					if (!localChanged && remoteChanged) {
						if (remoteShouldExistLocally(remote)) {
							nextItems.push(toSyncedLocal(remote, local));
						}
						pulled += 1;
						pulledIds.push(config.getId(remote));
						continue;
					}

					conflicts += 1;
					conflictIds.push(localId);

					if (config.onConflict) {
						nextItems.push(
							...(await config.onConflict(local, remote, {
								push: pushLocal
							}))
						);
						continue;
					}

					if (remoteShouldExistLocally(remote)) {
						nextItems.push(toSyncedLocal(remote, local));
					}
				}

				for (const remote of remoteSnapshot) {
					const remoteId = config.getId(remote);
					if (processedRemoteIds.has(remoteId) || !remoteShouldExistLocally(remote)) {
						continue;
					}

					nextItems.push(toSyncedLocal(remote, null));
					pulled += 1;
					pulledIds.push(remoteId);
				}

				await config.saveLocal(nextItems);
				return {
					items: nextItems,
					pushed,
					pulled,
					conflicts,
					pushedIds,
					pulledIds,
					conflictIds
				};
			} finally {
				syncInProgress = false;
			}
		}
	};
}
