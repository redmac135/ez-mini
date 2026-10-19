import test from 'node:test';
import assert from 'node:assert/strict';
import { JourneyStorage } from '../src/lib/journey/storage';
import {
	syncJourneyEntries,
	type JourneyApi,
	type RemoteJourneyEntry
} from '../src/lib/journey/sync';
import type { StoredJourneyEntry } from '../src/lib/journey';
import {
	journeyDateKey,
	journeyEntryDateKey,
	loadEntriesThroughDate,
	nextLocalDayStart,
	searchJourneyEntries
} from '../src/lib/journey/navigation';

const timestamp = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

class FakeApi implements JourneyApi {
	remote: RemoteJourneyEntry[];
	lastSince: string | null | undefined;
	serverSyncUpdatedAt = timestamp(30);
	beforeListEntries?: () => Promise<void>;
	constructor(entries: RemoteJourneyEntry[] = []) {
		this.remote = entries;
	}
	async listEntries(options?: { since?: string | null }) {
		await this.beforeListEntries?.();
		const since = options?.since;
		this.lastSince = since;
		return this.remote.filter(
			(entry) => !since || Date.parse(entry.sync_updated_at) >= Date.parse(since)
		);
	}
	async upsertEntry(entry: RemoteJourneyEntry) {
		const storedEntry = { ...entry, sync_updated_at: this.serverSyncUpdatedAt };
		const index = this.remote.findIndex((candidate) => candidate.id === entry.id);
		if (index < 0) this.remote.push(storedEntry);
		else this.remote[index] = storedEntry;
		return storedEntry;
	}
}

function entry(
	id: string,
	text: string,
	day: number,
	lastSyncedAt: string | null = null,
	lastRemoteChangeAt: string | null = lastSyncedAt
): StoredJourneyEntry {
	return {
		id,
		userId: 'user-a',
		text,
		createdAt: timestamp(day),
		updatedAt: timestamp(day),
		deletedAt: null,
		lastSyncedAt,
		lastRemoteChangeAt
	};
}

test.beforeEach(() => JourneyStorage.resetForTests());

test('sync unions independent entries from local and remote devices', async () => {
	const local = entry('local-entry', 'Written offline', 2);
	const remote: RemoteJourneyEntry = {
		id: 'remote-entry',
		user_id: 'user-a',
		text: 'Written elsewhere',
		created_at: timestamp(1),
		updated_at: timestamp(1),
		sync_updated_at: timestamp(1),
		deleted_at: null
	};
	await JourneyStorage.saveEntries([local]);
	const api = new FakeApi([remote]);
	const result = await syncJourneyEntries(api, 'user-a');
	const entries = await JourneyStorage.loadEntries('user-a');
	assert.equal(result.pushed, 1);
	assert.equal(result.pulled, 1);
	assert.deepEqual(entries.map(({ id }) => id).sort(), ['local-entry', 'remote-entry']);
});

test('sync pulls incrementally from the latest successfully synced remote timestamp', async () => {
	const remote: RemoteJourneyEntry = {
		id: 'remote-entry',
		user_id: 'user-a',
		text: 'Remote entry',
		created_at: timestamp(1),
		updated_at: timestamp(3),
		sync_updated_at: timestamp(3),
		deleted_at: null
	};
	const api = new FakeApi([remote]);
	await syncJourneyEntries(api, 'user-a');
	await syncJourneyEntries(api, 'user-a');
	assert.equal(api.lastSince, timestamp(3));
});

test('server change timestamps make backdated offline uploads visible to other devices', async () => {
	const known = entry('known-entry', 'Already synced', 10, timestamp(10));
	await JourneyStorage.saveEntries([known]);
	const api = new FakeApi([
		{
			id: known.id,
			user_id: 'user-a',
			text: known.text,
			created_at: known.createdAt,
			updated_at: known.updatedAt,
			sync_updated_at: timestamp(10),
			deleted_at: null
		}
	]);
	await syncJourneyEntries(api, 'user-a');
	await api.upsertEntry({
		id: 'backdated-offline-entry',
		user_id: 'user-a',
		text: 'Written offline',
		created_at: timestamp(8),
		updated_at: timestamp(8),
		sync_updated_at: timestamp(8),
		deleted_at: null
	});
	assert.equal(api.remote.at(-1)?.updated_at, timestamp(8));
	assert.equal(api.remote.at(-1)?.sync_updated_at, timestamp(30));

	await syncJourneyEntries(api, 'user-a');

	assert.equal(api.lastSince, timestamp(10));
	assert.equal(
		(await JourneyStorage.loadEntries('user-a')).some(
			(candidate) => candidate.id === 'backdated-offline-entry'
		),
		true
	);
});

test('same ID edits resolve to the most recently updated version', async () => {
	const local = entry('shared-entry', 'new local edit', 3, timestamp(1));
	await JourneyStorage.saveEntries([local]);
	const api = new FakeApi([
		{
			id: 'shared-entry',
			user_id: 'user-a',
			text: 'older remote edit',
			created_at: timestamp(1),
			updated_at: timestamp(2),
			sync_updated_at: timestamp(2),
			deleted_at: null
		}
	]);
	const result = await syncJourneyEntries(api, 'user-a');
	assert.equal(result.conflicts, 1);
	assert.equal(api.remote[0].text, 'new local edit');
	assert.equal((await JourneyStorage.loadEntries('user-a'))[0].text, 'new local edit');
});

test('sync preserves an edit made while the remote pull is pending', async () => {
	const local = entry('concurrent-entry', 'Before sync', 1, timestamp(1));
	await JourneyStorage.saveEntries([local]);
	let signalListStarted!: () => void;
	let releaseList!: () => void;
	const listStarted = new Promise<void>((resolve) => (signalListStarted = resolve));
	const listGate = new Promise<void>((resolve) => (releaseList = resolve));
	const api = new FakeApi([
		{
			id: local.id,
			user_id: 'user-a',
			text: 'Remote edit',
			created_at: local.createdAt,
			updated_at: timestamp(2),
			sync_updated_at: timestamp(2),
			deleted_at: null
		}
	]);
	api.beforeListEntries = async () => {
		signalListStarted();
		await listGate;
	};
	const syncing = syncJourneyEntries(api, 'user-a');
	await listStarted;
	await JourneyStorage.saveEntries([
		{ ...local, text: 'Concurrent local edit', updatedAt: timestamp(3) }
	]);
	releaseList();
	const result = await syncing;

	assert.equal((await JourneyStorage.loadEntries('user-a'))[0].text, 'Concurrent local edit');
	assert.equal(result.items[0].text, 'Concurrent local edit');
});

test('anonymous entries stay local until explicitly claimed for the account', async () => {
	await JourneyStorage.saveEntries([
		{
			...entry('offline-entry', 'Saved before login', 1),
			userId: 'anonymous'
		}
	]);
	assert.equal((await JourneyStorage.loadEntries(null)).length, 1);
	assert.equal((await JourneyStorage.loadEntries('user-a')).length, 0);
	await JourneyStorage.claimAnonymousEntries('user-a');
	assert.equal((await JourneyStorage.loadEntries(null)).length, 0);
	assert.equal((await JourneyStorage.loadEntries('user-a'))[0].text, 'Saved before login');
});

test('anonymous import prompt status is remembered separately for each account', async () => {
	assert.equal(await JourneyStorage.hasPromptedForAnonymousImport('user-a'), false);
	await JourneyStorage.markPromptedForAnonymousImport('user-a');
	assert.equal(await JourneyStorage.hasPromptedForAnonymousImport('user-a'), true);
	assert.equal(await JourneyStorage.hasPromptedForAnonymousImport('user-b'), false);
});

test('local timeline pages use a stable newest-first cursor without duplicates', async () => {
	await JourneyStorage.saveEntries(
		[1, 2, 3, 4, 5].map((day) => entry(`entry-${day}`, `Entry ${day}`, day))
	);
	const first = await JourneyStorage.loadPage('user-a', null, 2);
	assert.deepEqual(
		first.entries.map(({ id }) => id),
		['entry-5', 'entry-4']
	);
	assert.ok(first.nextCursor);
	const second = await JourneyStorage.loadPage('user-a', first.nextCursor, 2);
	assert.deepEqual(
		second.entries.map(({ id }) => id),
		['entry-3', 'entry-2']
	);
	const third = await JourneyStorage.loadPage('user-a', second.nextCursor, 2);
	assert.deepEqual(
		third.entries.map(({ id }) => id),
		['entry-1']
	);
	assert.equal(third.nextCursor, null);
});

test('Journey search includes saved entries outside the current timeline page', async () => {
	await JourneyStorage.saveEntries([
		entry('older-entry', 'A moment from months ago', 1),
		entry('newer-entry', 'A recent moment', 30)
	]);
	const timelinePage = await JourneyStorage.loadPage('user-a', null, 1);
	const allSavedEntries = await JourneyStorage.loadEntries('user-a');

	assert.deepEqual(
		searchJourneyEntries(allSavedEntries, 'months ago').map(({ id }) => id),
		['older-entry']
	);
	assert.deepEqual(searchJourneyEntries(timelinePage.entries, 'months ago'), []);
});

test('date navigation waits for an in-flight page before deciding to fetch more', async () => {
	let entries = [entry('newest', 'Newest', 30)];
	const hasMore = true;
	let started!: () => void;
	let release!: () => void;
	const pageStarted = new Promise<void>((resolve) => (started = resolve));
	const pageGate = new Promise<void>((resolve) => (release = resolve));
	const inFlightPage = (async () => {
		started();
		await pageGate;
		entries = [...entries, entry('middle', 'Middle', 20)];
	})();
	let pendingPage: Promise<void> | null = inFlightPage;
	let additionalLoads = 0;
	const loadNextPage = () => {
		if (pendingPage) {
			const page = pendingPage;
			pendingPage = null;
			return page;
		}
		additionalLoads += 1;
		return Promise.resolve();
	};
	await pageStarted;
	const navigation = loadEntriesThroughDate(
		'2026-01-25',
		() => entries.at(-1)?.createdAt.slice(0, 10),
		() => hasMore,
		loadNextPage
	);
	let completed = false;
	void navigation.then(() => (completed = true));
	await Promise.resolve();
	assert.equal(completed, false);
	release();
	await navigation;
	assert.equal(entries.at(-1)?.createdAt.slice(0, 10), '2026-01-20');
	assert.equal(additionalLoads, 0);
});

test('distant date navigation loads from a date anchor instead of paging through history', async () => {
	let pageLoads = 0;
	const anchors: string[] = [];
	await loadEntriesThroughDate(
		'2020-01-15',
		() => '2026-01-30',
		() => true,
		async () => {
			pageLoads += 1;
		},
		async (date) => {
			anchors.push(date);
		}
	);

	assert.equal(pageLoads, 0);
	assert.deepEqual(anchors, ['2020-01-15']);
});

test('date anchored storage pages include entries on or before the selected local day', async () => {
	await JourneyStorage.saveEntries([
		entry('before-date', 'Before', 10),
		entry('after-date', 'After', 20)
	]);
	const page = await JourneyStorage.loadPage('user-a', {
		createdAt: nextLocalDayStart('2026-01-15'),
		id: ''
	});

	assert.deepEqual(page.entries.map(({ id }) => id), ['before-date']);
});

test('calendar date keys cover saved entries and use local timeline dates', async () => {
	await JourneyStorage.saveEntries([
		entry('older-marker', 'Older saved entry', 1),
		entry('newer-marker', 'Newer saved entry', 30)
	]);
	const savedEntries = await JourneyStorage.loadEntries('user-a');
	assert.equal(new Set(savedEntries.map(({ createdAt }) => journeyEntryDateKey(createdAt))).size, 2);

	const previousTimeZone = process.env.TZ;
	process.env.TZ = 'Pacific/Auckland';
	try {
		const timestamp = '2026-01-01T20:30:00.000Z';
		const localDate = new Date(timestamp);
		assert.equal(journeyEntryDateKey(timestamp), journeyDateKey(localDate));
		assert.equal(journeyEntryDateKey(timestamp), '2026-01-02');
	} finally {
		if (previousTimeZone === undefined) delete process.env.TZ;
		else process.env.TZ = previousTimeZone;
	}
});
