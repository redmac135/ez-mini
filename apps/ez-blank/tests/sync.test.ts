import test from 'node:test';
import assert from 'node:assert/strict';
import { createPage, type EditorSession } from '../src/lib/editor/core/session.ts';
import {
	fetchRemoteActivePageId,
	forkConflictPage,
	isSyncInProgress,
	reconcileSyncResult,
	syncUserPages
} from '../src/lib/editor/sync.ts';
import type { PageSyncStatus } from '../src/lib/editor/persistence/records.ts';

type RemotePageRow = {
	id: string;
	user_id: string;
	title: string;
	content: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
};

type UserSettingsRow = {
	user_id: string;
	active_page_id: string | null;
	created_at?: string;
	updated_at?: string;
};

class FakeSupabase {
	private pages = new Map<string, RemotePageRow>();
	private userSettings = new Map<string, UserSettingsRow>();

	constructor(rows: RemotePageRow[] = [], settings: UserSettingsRow[] = []) {
		for (const row of rows) {
			this.pages.set(row.id, { ...row });
		}
		for (const setting of settings) {
			this.userSettings.set(setting.user_id, { ...setting });
		}
	}

	async listPages() {
		return [...this.pages.values()];
	}

	async upsertPage(payload: RemotePageRow) {
		this.pages.set(payload.id, { ...payload });
		return this.pages.get(payload.id)!;
	}

	async getSettings() {
		return this.userSettings.get('user-a') ?? null;
	}

	async updateSettings(payload: { active_page_id: string | null }) {
		const row = {
			user_id: 'user-a',
			active_page_id: payload.active_page_id
		};
		this.userSettings.set('user-a', row);
		return row;
	}

	from(table: string) {
		if (table === 'pages') {
			const pages = this.pages;
			return {
				select() {
					let userId = '';
					return {
						eq(column: string, value: string) {
							assert.equal(column, 'user_id');
							userId = value;
							return this;
						},
						order() {
							return this;
						},
						then(resolve: (value: unknown) => unknown) {
							const rows = [...pages.values()].filter((row) => row.user_id === userId);
							return Promise.resolve(resolve({ data: rows, error: null }));
						}
					};
				},
				upsert(payload: RemotePageRow) {
					pages.set(payload.id, { ...payload });
					return {
						select() {
							return {
								async single() {
									return { data: pages.get(payload.id) ?? null, error: null };
								}
							};
						}
					};
				}
			};
		}

		if (table === 'user_settings') {
			const userSettings = this.userSettings;
			return {
				select() {
					let userId = '';
					return {
						eq(column: string, value: string) {
							assert.equal(column, 'user_id');
							userId = value;
							return this;
						},
						async maybeSingle() {
							return { data: userSettings.get(userId) ?? null, error: null };
						}
					};
				},
				async upsert(payload: UserSettingsRow) {
					userSettings.set(payload.user_id, { ...payload });
					return { error: null };
				}
			};
		}

		throw new Error(`Unexpected table ${table}`);
	}

	getRows(userId: string) {
		return [...this.pages.values()].filter((row) => row.user_id === userId);
	}

	getActivePageId(userId: string) {
		return this.userSettings.get(userId)?.active_page_id ?? null;
	}
}

function buildSession(page: ReturnType<typeof createPage>, activePageId = page.id): EditorSession {
	return {
		pages: [page],
		activePageId
	};
}

test('forkConflictPage creates a visible local fork with a new id and suffix', () => {
	const source = createPage('body', {
		id: 'page-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	source.title = 'My Page';
	source.deletedAt = '2026-04-17T18:05:00.000Z';

	const fork = forkConflictPage(source, new Date('2026-04-17T18:10:00.000Z'));

	assert.notEqual(fork.id, source.id);
	assert.equal(fork.userId, 'user-a');
	assert.equal(fork.deletedAt, null);
	assert.equal(fork.syncStatus, 'dirty');
	assert.equal(fork.isEphemeral, false);
	assert.match(fork.title, /^My Page \(Local conflict /);
});

test('fetchRemoteActivePageId reads remote user settings only when asked', async () => {
	const supabase = new FakeSupabase([], [{ user_id: 'user-a', active_page_id: 'page-2' }]);
	assert.equal(await fetchRemoteActivePageId(supabase), 'page-2');
});

test('syncUserPages ignores ephemeral placeholder pages', async () => {
	const local = createPage('', { id: 'page-ephemeral', userId: 'user-a', isEphemeral: true });
	const supabase = new FakeSupabase();
	const result = await syncUserPages(
		supabase as never,
		'user-a',
		buildSession(local),
		new Date('2026-04-17T18:02:00.000Z')
	);

	assert.equal(result.pushedCount, 0);
	assert.equal(result.session.pages[0]?.id, 'page-ephemeral');
	assert.equal(result.session.pages[0]?.isEphemeral, true);
	assert.equal(supabase.getRows('user-a').length, 0);
});

test('syncUserPages pushes local-only real pages and trusts the write response', async () => {
	const local = createPage('local body', {
		id: 'local-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	local.title = 'Local';
	local.updatedAt = '2026-04-17T18:01:00.000Z';

	const supabase = new FakeSupabase();
	const result = await syncUserPages(
		supabase as never,
		'user-a',
		buildSession(local),
		new Date('2026-04-17T18:02:00.000Z')
	);

	assert.equal(result.pushedCount, 1);
	assert.equal(result.conflictCount, 0);
	assert.equal(result.session.pages[0]?.syncStatus, 'synced');
	assert.equal(result.session.pages[0]?.lastSyncedAt, '2026-04-17T18:01:00.000Z');
	assert.equal(supabase.getRows('user-a').length, 1);
	assert.equal(supabase.getRows('user-a')[0]?.id, 'local-1');
});

test('syncUserPages removes locally deleted pages when the remote row is already gone', async () => {
	const local = createPage('local body', {
		id: 'local-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	local.title = 'Local';
	local.lastSyncedAt = '2026-04-17T18:01:00.000Z';
	local.lastKnownRemoteUpdatedAt = '2026-04-17T18:01:00.000Z';
	local.lastKnownRemoteDeletedAt = null;
	local.deletedAt = '2026-04-17T18:02:00.000Z';
	local.updatedAt = '2026-04-17T18:02:00.000Z';
	local.syncStatus = 'dirty' as PageSyncStatus;

	const supabase = new FakeSupabase();
	const result = await syncUserPages(
		supabase as never,
		'user-a',
		buildSession(local),
		new Date('2026-04-17T18:03:00.000Z')
	);

	assert.equal(result.pushedCount, 0);
	assert.equal(result.pulledCount, 0);
	assert.equal(result.conflictCount, 0);
	assert.equal(result.session.pages.length, 1);
	assert.equal(result.session.pages[0]?.isEphemeral, true);
	assert.notEqual(result.session.pages[0]?.id, 'local-1');
	assert.equal(supabase.getRows('user-a').length, 0);
});

test('syncUserPages pulls remote-only pages into the local session', async () => {
	const supabase = new FakeSupabase([
		{
			id: 'remote-1',
			user_id: 'user-a',
			title: 'Remote',
			content: 'remote body',
			created_at: '2026-04-17T18:00:00.000Z',
			updated_at: '2026-04-17T18:00:00.000Z',
			deleted_at: null
		}
	]);
	const emptyLocal: EditorSession = { pages: [], activePageId: 'missing' };

	const result = await syncUserPages(
		supabase as never,
		'user-a',
		emptyLocal,
		new Date('2026-04-17T18:05:00.000Z')
	);

	assert.equal(result.pulledCount, 1);
	assert.equal(result.session.pages.length, 1);
	assert.equal(result.session.pages[0]?.id, 'remote-1');
	assert.equal(result.session.pages[0]?.syncStatus, 'synced');
	assert.equal(result.session.pages[0]?.lastSyncedAt, '2026-04-17T18:00:00.000Z');
	assert.equal(result.session.pages[0]?.isEphemeral, false);
});

test('syncUserPages ignores remote-only pages that are already deleted', async () => {
	const supabase = new FakeSupabase([
		{
			id: 'remote-1',
			user_id: 'user-a',
			title: 'Remote',
			content: 'remote body',
			created_at: '2026-04-17T18:00:00.000Z',
			updated_at: '2026-04-17T18:00:00.000Z',
			deleted_at: '2026-04-17T18:00:00.000Z'
		}
	]);
	const emptyLocal: EditorSession = { pages: [], activePageId: 'missing' };

	const result = await syncUserPages(
		supabase as never,
		'user-a',
		emptyLocal,
		new Date('2026-04-17T18:05:00.000Z')
	);

	assert.equal(result.pulledCount, 0);
	assert.equal(result.session.pages.length, 1);
	assert.equal(result.session.pages[0]?.isEphemeral, true);
});

test('reconcileSyncResult advances sync metadata without discarding newer local edits', () => {
	const source = createPage('alpha', {
		id: 'page-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	source.title = 'Alpha';
	source.updatedAt = '2026-04-17T18:01:00.000Z';
	source.lastSyncedAt = '2026-04-17T18:00:00.000Z';
	source.lastKnownRemoteUpdatedAt = '2026-04-17T18:00:00.000Z';
	source.lastKnownRemoteDeletedAt = null;
	source.syncStatus = 'dirty' as PageSyncStatus;

	const current = {
		...source,
		content: 'alpha beta',
		text: 'alpha beta',
		title: 'Alpha beta',
		updatedAt: '2026-04-17T18:02:00.000Z',
		syncStatus: 'dirty' as PageSyncStatus
	};

	const synced = {
		...source,
		lastSyncedAt: '2026-04-17T18:01:00.000Z',
		lastKnownRemoteUpdatedAt: '2026-04-17T18:01:00.000Z',
		syncStatus: 'synced' as PageSyncStatus
	};

	const result = reconcileSyncResult(
		buildSession(current),
		buildSession(source),
		buildSession(synced)
	);

	assert.equal(result.pages[0]?.content, 'alpha beta');
	assert.equal(result.pages[0]?.title, 'Alpha beta');
	assert.equal(result.pages[0]?.lastSyncedAt, '2026-04-17T18:01:00.000Z');
	assert.equal(result.pages[0]?.lastKnownRemoteUpdatedAt, '2026-04-17T18:01:00.000Z');
	assert.equal(result.pages[0]?.syncStatus, 'dirty');
});

test('reconcileSyncResult appends new synced pages while preserving current local pages', () => {
	const source = createPage('alpha', {
		id: 'page-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	source.title = 'Alpha';
	source.updatedAt = '2026-04-17T18:01:00.000Z';

	const current = {
		...source,
		content: 'alpha beta',
		text: 'alpha beta',
		title: 'Alpha beta',
		updatedAt: '2026-04-17T18:02:00.000Z',
		syncStatus: 'dirty' as PageSyncStatus
	};

	const conflictFork = createPage('fork body', {
		id: 'page-fork',
		userId: 'user-a',
		now: '2026-04-17T18:03:00.000Z',
		isEphemeral: false
	});
	conflictFork.title = 'Fork';
	conflictFork.updatedAt = '2026-04-17T18:03:00.000Z';
	conflictFork.lastSyncedAt = '2026-04-17T18:03:00.000Z';
	conflictFork.lastKnownRemoteUpdatedAt = '2026-04-17T18:03:00.000Z';
	conflictFork.lastKnownRemoteDeletedAt = null;
	conflictFork.syncStatus = 'synced' as PageSyncStatus;

	const synced = {
		...source,
		lastSyncedAt: '2026-04-17T18:01:00.000Z',
		lastKnownRemoteUpdatedAt: '2026-04-17T18:01:00.000Z',
		syncStatus: 'synced' as PageSyncStatus
	};

	const result = reconcileSyncResult(buildSession(current), buildSession(source), {
		pages: [synced, conflictFork],
		activePageId: current.id
	});

	assert.equal(
		result.pages.some((page) => page.id === 'page-1' && page.content === 'alpha beta'),
		true
	);
	assert.equal(
		result.pages.some((page) => page.id === 'page-fork' && page.content === 'fork body'),
		true
	);
});

test('syncUserPages forks when local and remote both changed', async () => {
	const local = createPage('local edit', {
		id: 'page-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	local.title = 'Shared';
	local.updatedAt = '2026-04-17T18:03:00.000Z';
	local.lastSyncedAt = '2026-04-17T18:01:00.000Z';
	local.lastKnownRemoteUpdatedAt = '2026-04-17T18:01:00.000Z';
	local.lastKnownRemoteDeletedAt = null;
	local.syncStatus = 'dirty' as PageSyncStatus;

	const supabase = new FakeSupabase([
		{
			id: 'page-1',
			user_id: 'user-a',
			title: 'Shared',
			content: 'remote edit',
			created_at: '2026-04-17T18:00:00.000Z',
			updated_at: '2026-04-17T18:04:00.000Z',
			deleted_at: null
		}
	]);

	const result = await syncUserPages(
		supabase as never,
		'user-a',
		buildSession(local),
		new Date('2026-04-17T18:05:00.000Z')
	);

	assert.equal(result.conflictCount, 1);
	assert.equal(result.pushedCount, 1);
	assert.equal(result.session.pages.length, 2);
	assert.notEqual(result.session.pages[0]?.id, 'page-1');
	assert.match(result.session.pages[0]?.title ?? '', /^Shared \(Local conflict /);
	assert.equal(result.session.pages[0]?.content, 'local edit');
	assert.equal(result.session.pages[0]?.syncStatus, 'synced');
	assert.equal(result.session.pages[0]?.lastSyncedAt, result.session.pages[0]?.updatedAt);
	assert.equal(result.session.pages[0]?.isEphemeral, false);
	assert.equal(result.session.pages[1]?.id, 'page-1');
	assert.equal(result.session.pages[1]?.content, 'remote edit');
	assert.equal(result.session.pages[1]?.syncStatus, 'synced');
	assert.equal(supabase.getRows('user-a').length, 2);
	assert.equal(
		supabase.getRows('user-a').some((row) => row.content === 'local edit'),
		true
	);
});

test('syncUserPages handles remote delete versus local edit by forking the local edit', async () => {
	const local = createPage('keep me locally', {
		id: 'page-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	local.title = 'Conflict';
	local.updatedAt = '2026-04-17T18:03:00.000Z';
	local.lastSyncedAt = '2026-04-17T18:01:00.000Z';
	local.lastKnownRemoteUpdatedAt = '2026-04-17T18:01:00.000Z';
	local.lastKnownRemoteDeletedAt = null;
	local.syncStatus = 'dirty' as PageSyncStatus;

	const supabase = new FakeSupabase([
		{
			id: 'page-1',
			user_id: 'user-a',
			title: 'Conflict',
			content: 'server copy',
			created_at: '2026-04-17T18:00:00.000Z',
			updated_at: '2026-04-17T18:04:00.000Z',
			deleted_at: '2026-04-17T18:04:00.000Z'
		}
	]);

	const result = await syncUserPages(
		supabase as never,
		'user-a',
		buildSession(local),
		new Date('2026-04-17T18:05:00.000Z')
	);

	assert.equal(result.conflictCount, 1);
	assert.equal(result.pushedCount, 1);
	assert.equal(result.session.pages.length, 1);
	assert.notEqual(result.session.pages[0]?.id, 'page-1');
	assert.equal(result.session.pages[0]?.deletedAt, null);
	assert.equal(result.session.pages[0]?.content, 'keep me locally');
	assert.match(result.session.pages[0]?.title ?? '', /^Conflict \(Local conflict /);
	assert.equal(supabase.getRows('user-a').length, 2);
	assert.equal(
		supabase.getRows('user-a').some((row) => row.id === 'page-1' && row.deleted_at !== null),
		true
	);
	assert.equal(
		supabase
			.getRows('user-a')
			.some((row) => row.content === 'keep me locally' && row.deleted_at === null),
		true
	);
});

test('syncUserPages removes local pages when the remote version is deleted without a local edit', async () => {
	const local = createPage('server body', {
		id: 'page-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	local.title = 'Conflict';
	local.updatedAt = '2026-04-17T18:01:00.000Z';
	local.lastSyncedAt = '2026-04-17T18:01:00.000Z';
	local.lastKnownRemoteUpdatedAt = '2026-04-17T18:01:00.000Z';
	local.lastKnownRemoteDeletedAt = null;
	local.syncStatus = 'synced' as PageSyncStatus;

	const supabase = new FakeSupabase([
		{
			id: 'page-1',
			user_id: 'user-a',
			title: 'Conflict',
			content: 'server body',
			created_at: '2026-04-17T18:00:00.000Z',
			updated_at: '2026-04-17T18:04:00.000Z',
			deleted_at: '2026-04-17T18:04:00.000Z'
		}
	]);

	const result = await syncUserPages(
		supabase as never,
		'user-a',
		buildSession(local),
		new Date('2026-04-17T18:05:00.000Z')
	);

	assert.equal(result.pulledCount, 1);
	assert.equal(result.conflictCount, 0);
	assert.equal(result.session.pages.length, 1);
	assert.equal(result.session.pages[0]?.isEphemeral, true);
});

test('syncUserPages rejects concurrent sync passes with the global guard', async () => {
	let releaseSnapshot!: () => void;
	const snapshotBlocked = new Promise<void>((resolve) => {
		releaseSnapshot = resolve;
	});

	const supabase = {
		async listPages() {
			await snapshotBlocked;
			return [];
		},
		async upsertPage(payload: RemotePageRow) {
			return payload;
		},
		async getSettings() {
			return null;
		},
		async updateSettings() {
			return { user_id: 'user-a', active_page_id: null };
		}
	};

	const local = createPage('local body', {
		id: 'page-1',
		userId: 'user-a',
		now: '2026-04-17T18:00:00.000Z',
		isEphemeral: false
	});
	const firstSync = syncUserPages(supabase as never, 'user-a', buildSession(local));
	assert.equal(isSyncInProgress(), true);

	await assert.rejects(
		() => syncUserPages(supabase as never, 'user-a', buildSession(local)),
		/Sync already in progress\./i
	);

	releaseSnapshot();
	await firstSync;
	assert.equal(isSyncInProgress(), false);
});
