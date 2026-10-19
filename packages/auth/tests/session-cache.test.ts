import assert from 'node:assert/strict';
import test from 'node:test';
import {
	AUTH_SESSION_CACHE_KEY,
	clearCachedAuthSessionForUser,
	readCachedAuthSession,
	writeCachedAuthSession,
	type AuthSessionCacheStorage,
	type AuthSessionSummary
} from '../src/index.ts';

const session: AuthSessionSummary = {
	sessionId: 'session-a',
	userId: 'user-a',
	email: 'user-a@example.com',
	username: 'User A',
	displayName: 'User A',
	createdAt: 1,
	lastUsedAt: 2,
	active: true
};

test('auth session cache writes and reads the latest account summary', () => {
	const storage = createMemoryStorage();

	writeCachedAuthSession(storage, session);

	assert.deepEqual(readCachedAuthSession(storage), session);
	assert.equal(storage.values.get(AUTH_SESSION_CACHE_KEY), JSON.stringify(session));
});

test('auth session cache clears only when the cached account matches', () => {
	const storage = createMemoryStorage();
	writeCachedAuthSession(storage, session);

	clearCachedAuthSessionForUser(storage, 'other-user');
	assert.deepEqual(readCachedAuthSession(storage), session);

	clearCachedAuthSessionForUser(storage, session.userId);
	assert.equal(readCachedAuthSession(storage), null);
});

test('legacy cached profile labels migrate to the email fallback', () => {
	const storage = createMemoryStorage();
	const legacySession = { ...session };
	delete legacySession.displayName;
	storage.setItem(
		AUTH_SESSION_CACHE_KEY,
		JSON.stringify({ ...legacySession, username: 'Custom profile name' })
	);

	const migratedSession = readCachedAuthSession(storage);
	assert.equal(migratedSession?.username, 'user-a@example.com');
	assert.equal(migratedSession?.displayName, 'user-a@example.com');
});

function createMemoryStorage(): AuthSessionCacheStorage & { values: Map<string, string> } {
	const values = new Map<string, string>();
	return {
		values,
		getItem(key) {
			return values.get(key) ?? null;
		},
		setItem(key, value) {
			values.set(key, value);
		},
		removeItem(key) {
			values.delete(key);
		}
	};
}
