import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthClient, AuthSessionResponse, AuthSessionSummary } from '@ez/auth';
import { createAccountDataController, type AccountDataAdapter } from '../src/index.ts';

const userA = createSession('session-a', 'user-a', true);
const userB = createSession('session-b', 'user-b', false);

test('initializes anonymous data without an auth client', async () => {
	const adapter = createDataAdapter();
	const account = createAccountDataController({ authClient: null, adapter });

	await account.initialize();

	assert.equal(account.getState().user, null);
	assert.equal(account.getState().data, 'anonymous');
	assert.equal(account.getState().phase, 'ready');
	account.destroy();
});

test('initializes authenticated data from the active session', async () => {
	const auth = createAuthClient({ activeSession: userA, sessions: [userA] });
	const adapter = createDataAdapter();
	const account = createAccountDataController({ authClient: auth, adapter });

	await account.initialize();

	assert.equal(account.getState().user?.userId, 'user-a');
	assert.equal(account.getState().data, 'account:user-a');
	assert.deepEqual(adapter.loads, ['account:user-a']);
	account.destroy();
});

test('opens login flow and surfaces login request failures', async () => {
	const auth = createAuthClient({
		activeSession: null,
		sessions: [],
		loginError: new Error('Failed to fetch.')
	});
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });

	account.openLoginFlow();
	await account.submitLogin('user@example.com');

	assert.equal(account.getState().loginModalOpen, true);
	assert.equal(account.getState().loginStep, 'email');
	assert.equal(account.getState().authMessage, 'Failed to fetch.');
	account.destroy();
});

test('verifies otp, closes login modal, and loads account data', async () => {
	const activeUser = { ...userA, active: true };
	const auth = createAuthClient({
		activeSession: null,
		sessions: [],
		verifyResponse: { activeSession: activeUser, sessions: [activeUser] }
	});
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });

	account.openLoginFlow();
	await account.submitLogin('user@example.com');
	await account.verifyOtpCode('12345678');

	assert.equal(account.getState().loginModalOpen, false);
	assert.equal(account.getState().user?.userId, 'user-a');
	assert.equal(account.getState().data, 'account:user-a');
	account.destroy();
});

test('initial cached user is exposed without starting a duplicate data load', async () => {
	const adapter = createDataAdapter();
	const activeB = { ...userB, active: true };
	const auth = createAuthClient({
		activeSession: activeB,
		sessions: [{ ...userA, active: false }, activeB]
	});
	const account = createAccountDataController({ authClient: auth, adapter });

	await account.initialize({ initialUser: { ...userA, active: true } });

	assert.equal(account.getState().user?.userId, 'user-b');
	assert.equal(account.getState().data, 'account:user-b');
	assert.deepEqual(adapter.loads, ['account:user-b']);
	account.destroy();
});

test('logout deletes account data and falls back to anonymous data', async () => {
	const auth = createAuthClient({
		activeSession: userA,
		sessions: [userA],
		logoutResponse: { activeSession: null, sessions: [] }
	});
	const adapter = createDataAdapter();
	const account = createAccountDataController({ authClient: auth, adapter });

	await account.initialize();
	await account.logoutCurrentAccount();

	assert.deepEqual(adapter.deletedUserIds, ['user-a']);
	assert.equal(account.getState().user, null);
	assert.equal(account.getState().data, 'anonymous');
	account.destroy();
});

test('refreshes data when the adapter reports storage changes', async () => {
	let refresh: (() => void) | null = null;
	let version = 0;
	const adapter: AccountDataAdapter<string> = {
		loadAnonymous: async () => `anonymous:${++version}`,
		loadAccount: async (user) => `account:${user.userId}:${++version}`,
		subscribeToDataChanges: (_scope, nextRefresh) => {
			refresh = nextRefresh;
			return () => {
				refresh = null;
			};
		}
	};
	const account = createAccountDataController({ authClient: null, adapter });

	await account.initialize();
	refresh?.();
	await waitFor(() => account.getState().data === 'anonymous:2');

	assert.equal(account.getState().data, 'anonymous:2');
	account.destroy();
});

function createDataAdapter() {
	const loads: string[] = [];
	const deletedUserIds: string[] = [];
	const adapter: AccountDataAdapter<string> & { loads: string[]; deletedUserIds: string[] } = {
		loads,
		deletedUserIds,
		async loadAnonymous() {
			loads.push('anonymous');
			return 'anonymous';
		},
		async loadAccount(user) {
			const value = `account:${user.userId}`;
			loads.push(value);
			return value;
		},
		async deleteAccountData(userId) {
			deletedUserIds.push(userId);
		}
	};
	return adapter;
}

function createAuthClient(options: {
	activeSession: AuthSessionSummary | null;
	sessions: AuthSessionSummary[];
	loginError?: Error;
	verifyResponse?: AuthSessionResponse;
	switchResponse?: AuthSessionResponse;
	logoutResponse?: AuthSessionResponse;
}): AuthClient {
	return {
		async login() {
			if (options.loginError) {
				throw options.loginError;
			}
			return { sent: true };
		},
		async verify() {
			return (
				options.verifyResponse ?? {
					activeSession: options.activeSession,
					sessions: options.sessions
				}
			);
		},
		async getSession() {
			return {
				activeSession: options.activeSession,
				sessions: options.sessions
			};
		},
		async switchSession() {
			return (
				options.switchResponse ?? {
					activeSession: options.activeSession,
					sessions: options.sessions
				}
			);
		},
		async logout() {
			return (
				options.logoutResponse ?? {
					activeSession: null,
					sessions: []
				}
			);
		},
		async authFetch() {
			return new Response(null);
		}
	};
}

function createSession(sessionId: string, userId: string, active: boolean): AuthSessionSummary {
	return {
		sessionId,
		userId,
		email: `${userId}@example.com`,
		username: userId,
		createdAt: 1,
		lastUsedAt: 2,
		active
	};
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000) {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error('Timed out waiting for condition.');
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}
