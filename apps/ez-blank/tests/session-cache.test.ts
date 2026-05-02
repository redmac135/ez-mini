import test from 'node:test';
import assert from 'node:assert/strict';
import {
	clearCachedAuthSessionForUser,
	LAST_AUTH_SESSION_KEY,
	normalizeCachedAuthSession,
	readCachedAuthSession,
	writeCachedAuthSession
} from '../src/lib/auth/session-cache.ts';
import type { AuthSessionSummary } from '@ez/auth';

class MemoryStorage {
	values = new Map<string, string>();

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}

	removeItem(key: string) {
		this.values.delete(key);
	}
}

const session: AuthSessionSummary = {
	sessionId: 'session-a',
	userId: 'user-a',
	email: 'a@example.test',
	username: 'a@example.test',
	createdAt: 1,
	lastUsedAt: 2,
	active: true
};

test('session cache round-trips the last auth session', () => {
	const storage = new MemoryStorage();

	writeCachedAuthSession(storage, session);

	assert.deepEqual(readCachedAuthSession(storage), session);
});

test('session cache clears only matching cached users', () => {
	const storage = new MemoryStorage();
	writeCachedAuthSession(storage, session);

	clearCachedAuthSessionForUser(storage, 'other-user');
	assert.equal(storage.getItem(LAST_AUTH_SESSION_KEY), JSON.stringify(session));

	clearCachedAuthSessionForUser(storage, 'user-a');
	assert.equal(storage.getItem(LAST_AUTH_SESSION_KEY), null);
});

test('cached session normalization rejects malformed values and fills username', () => {
	assert.equal(normalizeCachedAuthSession({ sessionId: 'missing-fields' }), null);
	assert.deepEqual(
		normalizeCachedAuthSession({
			sessionId: 'session-a',
			userId: 'user-a',
			email: null,
			createdAt: 1,
			lastUsedAt: 2,
			active: false
		}),
		{
			sessionId: 'session-a',
			userId: 'user-a',
			email: null,
			username: 'user-a',
			createdAt: 1,
			lastUsedAt: 2,
			active: false
		}
	);
});
