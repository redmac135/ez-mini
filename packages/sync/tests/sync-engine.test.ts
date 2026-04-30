import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine, type SyncEngineConfig } from '../src/index.ts';

type LocalItem = {
	id: string;
	body: string;
	updatedAt: string;
	deletedAt: string | null;
	lastSyncedAt: string | null;
	localOnly?: boolean;
};

type RemoteItem = {
	id: string;
	body: string;
	updated_at: string;
	deleted_at: string | null;
};

function local(overrides: Partial<LocalItem> & { id: string }): LocalItem {
	return {
		body: '',
		updatedAt: '2026-04-17T18:00:00.000Z',
		deletedAt: null,
		lastSyncedAt: null,
		...overrides
	};
}

function remote(overrides: Partial<RemoteItem> & { id: string }): RemoteItem {
	return {
		body: '',
		updated_at: '2026-04-17T18:00:00.000Z',
		deleted_at: null,
		...overrides
	};
}

function createConfig(
	overrides: Partial<SyncEngineConfig<LocalItem, RemoteItem>> & {
		localItems?: LocalItem[];
		remoteItems?: RemoteItem[];
	}
): SyncEngineConfig<LocalItem, RemoteItem> & { saved: LocalItem[][]; pushed: RemoteItem[] } {
	const saved: LocalItem[][] = [];
	const pushed: RemoteItem[] = [];
	const localItems = overrides.localItems ?? [];
	const remoteItems = overrides.remoteItems ?? [];

	return {
		saved,
		pushed,
		pull: async () => remoteItems,
		push: async (item) => {
			pushed.push(item);
			return { ...item, updated_at: `${item.updated_at}.server` };
		},
		getLocal: async () => localItems,
		saveLocal: async (items) => {
			saved.push(items);
		},
		toRemote: (item) => ({
			id: item.id,
			body: item.body,
			updated_at: item.updatedAt,
			deleted_at: item.deletedAt
		}),
		toLocal: (item, existing) => ({
			...(existing ?? local({ id: item.id })),
			id: item.id,
			body: item.body,
			updatedAt: item.updated_at,
			deletedAt: item.deleted_at,
			lastSyncedAt: item.updated_at
		}),
		getId: (item) => item.id,
		getSince: () => null,
		getLocalUpdatedAt: (item) => item.updatedAt,
		getRemoteUpdatedAt: (item) => item.updated_at,
		getLocalDeletedAt: (item) => item.deletedAt,
		getRemoteDeletedAt: (item) => item.deleted_at,
		getLastSyncedAt: (item) => item.lastSyncedAt,
		setLastSyncedAt: (item, value) => ({ ...item, lastSyncedAt: value }),
		shouldKeepRemote: (item) => item.deleted_at === null,
		areStatesEqual: (localItem, remoteItem) =>
			localItem.body === remoteItem.body && localItem.deletedAt === remoteItem.deleted_at,
		...overrides
	};
}

test('pushes local-only items one at a time and trusts push responses', async () => {
	const config = createConfig({
		localItems: [
			local({ id: 'local-1', body: 'one', updatedAt: '2026-04-17T18:01:00.000Z' }),
			local({ id: 'local-2', body: 'two', updatedAt: '2026-04-17T18:02:00.000Z' })
		]
	});
	const result = await createSyncEngine(config).sync();

	assert.deepEqual(
		config.pushed.map((item) => item.id),
		['local-1', 'local-2']
	);
	assert.equal(result.pushed, 2);
	assert.deepEqual(result.pushedIds, ['local-1', 'local-2']);
	assert.deepEqual(
		result.items.map((item) => item.lastSyncedAt),
		['2026-04-17T18:01:00.000Z.server', '2026-04-17T18:02:00.000Z.server']
	);
	assert.deepEqual(config.saved[0], result.items);
});

test('passes getSince result to pull', async () => {
	const sinceCalls: LocalItem[][] = [];
	const pullCalls: Array<string | null> = [];
	const config = createConfig({
		localItems: [local({ id: 'item-1', lastSyncedAt: '2026-04-17T18:00:00.000Z' })],
		getSince: (items) => {
			sinceCalls.push(items);
			return '2026-04-17T18:00:00.000Z';
		},
		pull: async (since) => {
			pullCalls.push(since);
			return [];
		}
	});

	await createSyncEngine(config).sync();

	assert.equal(sinceCalls.length, 1);
	assert.deepEqual(pullCalls, ['2026-04-17T18:00:00.000Z']);
});

test('pulls remote-only items and returns pulled ids', async () => {
	const config = createConfig({
		remoteItems: [remote({ id: 'remote-1', body: 'from server' })]
	});
	const result = await createSyncEngine(config).sync();

	assert.equal(result.pulled, 1);
	assert.deepEqual(result.pulledIds, ['remote-1']);
	assert.equal(result.items[0]?.body, 'from server');
	assert.equal(result.items[0]?.lastSyncedAt, '2026-04-17T18:00:00.000Z');
});

test('preserves items excluded by shouldSync', async () => {
	const skipped = local({ id: 'draft', body: 'local only', localOnly: true });
	const config = createConfig({
		localItems: [skipped],
		shouldSync: (item) => item.localOnly !== true
	});
	const result = await createSyncEngine(config).sync();

	assert.deepEqual(result.items, [skipped]);
	assert.equal(result.pushed, 0);
});

test('drops locally deleted items that no longer exist remotely', async () => {
	const config = createConfig({
		localItems: [
			local({
				id: 'deleted',
				deletedAt: '2026-04-17T18:02:00.000Z',
				lastSyncedAt: '2026-04-17T18:01:00.000Z'
			})
		]
	});
	const result = await createSyncEngine(config).sync();

	assert.deepEqual(result.items, []);
	assert.equal(result.pushed, 0);
});

test('same state marks an item synced without pushing or pulling', async () => {
	const config = createConfig({
		localItems: [local({ id: 'shared', body: 'same' })],
		remoteItems: [
			remote({
				id: 'shared',
				body: 'same',
				updated_at: '2026-04-17T18:05:00.000Z'
			})
		]
	});
	const result = await createSyncEngine(config).sync();

	assert.equal(result.pushed, 0);
	assert.equal(result.pulled, 0);
	assert.equal(result.items[0]?.lastSyncedAt, '2026-04-17T18:05:00.000Z');
});

test('remote deletes remove clean local items and count as pulled changes', async () => {
	const config = createConfig({
		localItems: [
			local({
				id: 'shared',
				body: 'server body',
				lastSyncedAt: '2026-04-17T18:01:00.000Z'
			})
		],
		remoteItems: [
			remote({
				id: 'shared',
				body: 'server body',
				updated_at: '2026-04-17T18:01:00.000Z',
				deleted_at: '2026-04-17T18:04:00.000Z'
			})
		]
	});
	const result = await createSyncEngine(config).sync();

	assert.deepEqual(result.items, []);
	assert.equal(result.pulled, 1);
	assert.deepEqual(result.pulledIds, ['shared']);
});

test('conflicts call the app hook and helper pushes are counted', async () => {
	const config = createConfig({
		localItems: [
			local({
				id: 'shared',
				body: 'local edit',
				updatedAt: '2026-04-17T18:03:00.000Z',
				lastSyncedAt: '2026-04-17T18:01:00.000Z'
			})
		],
		remoteItems: [
			remote({
				id: 'shared',
				body: 'remote edit',
				updated_at: '2026-04-17T18:04:00.000Z'
			})
		],
		onConflict: async (_local, remoteItem, helpers) => [
			local({
				id: remoteItem.id,
				body: remoteItem.body,
				updatedAt: remoteItem.updated_at,
				lastSyncedAt: remoteItem.updated_at
			}),
			await helpers.push(
				local({
					id: 'fork',
					body: 'local edit',
					updatedAt: '2026-04-17T18:05:00.000Z'
				})
			)
		]
	});
	const result = await createSyncEngine(config).sync();

	assert.equal(result.conflicts, 1);
	assert.deepEqual(result.conflictIds, ['shared']);
	assert.equal(result.pushed, 1);
	assert.deepEqual(result.pushedIds, ['fork']);
	assert.deepEqual(
		result.items.map((item) => item.id),
		['shared', 'fork']
	);
});

test('concurrency guard is per engine instance', async () => {
	let releasePull!: () => void;
	const blockedPull = new Promise<RemoteItem[]>((resolve) => {
		releasePull = () => resolve([]);
	});
	const firstEngine = createSyncEngine(
		createConfig({
			pull: async () => blockedPull
		})
	);
	const secondEngine = createSyncEngine(createConfig({}));

	const firstRun = firstEngine.sync();
	assert.equal(firstEngine.isSyncInProgress(), true);
	assert.equal(secondEngine.isSyncInProgress(), false);

	await assert.rejects(() => firstEngine.sync(), /Sync already in progress\./i);
	await secondEngine.sync();

	releasePull();
	await firstRun;
	assert.equal(firstEngine.isSyncInProgress(), false);
});
