import test from 'node:test';
import assert from 'node:assert/strict';
import { JourneyStorage } from '../src/lib/journey/storage';
import {
	syncJourneyEntries,
	type JourneyApi,
	type RemoteJourneyEntry
} from '../src/lib/journey/sync';
import type { StoredJourneyEntry } from '../src/lib/journey';

const timestamp = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

class FakeApi implements JourneyApi {
	remote: RemoteJourneyEntry[];
	lastSince: string | null | undefined;
	constructor(entries: RemoteJourneyEntry[] = []) {
		this.remote = entries;
	}
	async listEntries(options?: { since?: string | null }) {
		this.lastSince = options?.since;
		return [...this.remote];
	}
	async upsertEntry(entry: RemoteJourneyEntry) {
		const index = this.remote.findIndex((candidate) => candidate.id === entry.id);
		if (index < 0) this.remote.push(entry);
		else this.remote[index] = entry;
		return entry;
	}
}

function entry(
	id: string,
	text: string,
	day: number,
	lastSyncedAt: string | null = null
): StoredJourneyEntry {
	return {
		id,
		userId: 'user-a',
		text,
		createdAt: timestamp(day),
		updatedAt: timestamp(day),
		deletedAt: null,
		lastSyncedAt
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
		deleted_at: null
	};
	const api = new FakeApi([remote]);
	await syncJourneyEntries(api, 'user-a');
	await syncJourneyEntries(api, 'user-a');
	assert.equal(api.lastSince, timestamp(3));
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
			deleted_at: null
		}
	]);
	const result = await syncJourneyEntries(api, 'user-a');
	assert.equal(result.conflicts, 1);
	assert.equal(api.remote[0].text, 'new local edit');
	assert.equal((await JourneyStorage.loadEntries('user-a'))[0].text, 'new local edit');
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
