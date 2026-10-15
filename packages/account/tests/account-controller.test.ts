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

test('opens login flow after an empty saved-session lookup', async () => {
	const account = createAccountDataController({
		authClient: createAuthClient({ activeSession: null, sessions: [] }),
		adapter: createDataAdapter()
	});

	await account.openLoginOrAccountList();

	assert.equal(account.getState().loginModalOpen, true);
	assert.equal(account.getState().authBusy, false);
	account.destroy();
});

test('loads connected identities and refreshes them after disconnecting one', async () => {
	const auth = createAuthClient({ activeSession: userA, sessions: [userA] });
	const remainingIdentity = {
		id: 'email-identity',
		provider: 'email',
		displayName: 'user-a',
		email: 'user-a@example.com',
		createdAt: null
	};
	let unlinkIdentityId = '';
	auth.getIdentities = async () => ({
		identities: [
			remainingIdentity,
			{
				id: 'github-identity',
				provider: 'github',
				displayName: 'user-a',
				email: 'user-a@example.com',
				createdAt: null
			}
		]
	});
	auth.unlinkIdentity = async (identityId) => {
		unlinkIdentityId = identityId;
		return { identities: [remainingIdentity] };
	};
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });

	await account.initialize();
	await account.openConnectedAccounts();
	assert.equal(account.getState().connectedAccountsOpen, true);
	assert.equal(account.getState().identitiesLoading, false);
	assert.deepEqual(
		account.getState().identities.map(({ provider }) => provider),
		['email', 'github']
	);

	await account.unlinkOAuthIdentity('github-identity');
	assert.equal(unlinkIdentityId, 'github-identity');
	assert.deepEqual(account.getState().identities, [remainingIdentity]);
	assert.equal(account.getState().identityBusyId, null);
	account.destroy();
});

test('connected identity request failures leave the modal open with a readable message', async () => {
	const auth = createAuthClient({ activeSession: userA, sessions: [userA] });
	auth.getIdentities = async () => {
		throw new Error('Identity service unavailable.');
	};
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });

	await account.initialize();
	await account.openConnectedAccounts();

	assert.equal(account.getState().connectedAccountsOpen, true);
	assert.equal(account.getState().identitiesLoading, false);
	assert.equal(account.getState().authMessage, 'Identity service unavailable.');
	account.destroy();
});

test('display name defaults to provider username, supports cancel, and saves account-wide profile state', async () => {
	const auth = createAuthClient({ activeSession: userA, sessions: [userA] });
	auth.getIdentities = async () => ({
		identities: [
			{
				id: 'github-identity',
				provider: 'github',
				displayName: 'taylor-dev',
				email: 'user-a@example.com',
				createdAt: null
			}
		]
	});
	auth.getProfile = async () => ({ displayName: 'taylor-dev', customDisplayName: null });
	let savedName = '';
	auth.updateProfile = async (displayName) => {
		savedName = displayName;
		return { displayName, customDisplayName: displayName };
	};
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });

	await account.initialize();
	await account.openConnectedAccounts();
	assert.equal(account.getState().displayName, 'taylor-dev');
	assert.equal(account.getState().displayNameDraft, 'taylor-dev');

	account.setDisplayNameDraft('Discard this');
	account.cancelDisplayNameEdit();
	assert.equal(account.getState().displayNameDraft, 'taylor-dev');

	account.setDisplayNameDraft('Taylor');
	await account.saveDisplayName();
	assert.equal(savedName, 'Taylor');
	assert.equal(account.getState().displayName, 'Taylor');
	assert.equal(account.getState().user?.username, 'Taylor');
	assert.equal(account.getState().sessions[0]?.username, 'Taylor');
	account.destroy();
});

test('signing in with the current account reuses the account list as a confirmation popup', async () => {
	const auth = createAuthClient({ activeSession: userA, sessions: [userA] });
	auth.verify = async () => ({
		activeSession: userA,
		sessions: [userA],
		alreadySignedIn: true
	});
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });

	await account.initialize();
	account.openLoginFlow();
	await account.submitLogin('user-a@example.com');
	await account.verifyOtpCode('12345678');

	assert.equal(account.getState().user?.userId, 'user-a');
	assert.equal(account.getState().accountModalOpen, true);
	assert.equal(account.getState().authMessage, 'Already signed into this account.');
	account.destroy();
});

test('shows lookup errors and retries the same login flow', async () => {
	let calls = 0;
	const auth = createAuthClient({ activeSession: null, sessions: [] });
	const getAccounts = auth.getAccounts;
	auth.getAccounts = async (options) => {
		calls += 1;
		if (calls === 1) throw new Error('Network unavailable');
		return getAccounts(options);
	};
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });

	await account.openLoginOrAccountList();
	assert.equal(account.getState().loginModalOpen, true);
	assert.equal(account.getState().loginLookup, 'failed');
	assert.equal(account.getState().authMessage, 'Network unavailable');

	await account.openLoginOrAccountList();
	assert.equal(account.getState().loginLookup, 'idle');
	assert.equal(account.getState().loginModalOpen, true);
	assert.equal(calls, 2);
	account.destroy();
});

test('closing the login dialog aborts a pending session lookup', async () => {
	let lookupSignal: AbortSignal | undefined;
	const auth = createAuthClient({ activeSession: null, sessions: [] });
	auth.getAccounts = (options) => {
		lookupSignal = options?.signal;
		return new Promise((_resolve, reject) => {
			lookupSignal?.addEventListener('abort', () =>
				reject(new DOMException('Aborted', 'AbortError'))
			);
		});
	};
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });
	const lookup = account.openLoginOrAccountList();

	assert.equal(account.getState().loginModalOpen, true);
	assert.equal(account.getState().loginLookup, 'loading');
	account.closeLoginModal();
	await lookup;

	assert.equal(lookupSignal?.aborted, true);
	assert.equal(account.getState().loginModalOpen, false);
	assert.equal(account.getState().loginLookup, 'idle');
	assert.equal(account.getState().authBusy, false);
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

test('keeps the prior context visible while account data loads and cancels back to local data', async () => {
	const activeUser = { ...userA, active: true };
	const auth = createAuthClient({
		activeSession: null,
		sessions: [],
		verifyResponse: { activeSession: activeUser, sessions: [activeUser] },
		useAnonymousResponse: {
			activeSession: null,
			sessions: [{ ...activeUser, active: false }]
		}
	});
	let loadSignal: AbortSignal | undefined;
	let adapterRestores = 0;
	const adapter: AccountDataAdapter<string> = {
		...createDataAdapter(),
		loadAccount(_user, options) {
			loadSignal = options?.signal;
			return new Promise((_resolve, reject) => {
				loadSignal?.addEventListener('abort', () =>
					reject(new DOMException('Aborted', 'AbortError'))
				);
			});
		},
		async restoreLocalContext(user) {
			assert.equal(user, null);
			adapterRestores += 1;
		}
	};
	const account = createAccountDataController({ authClient: auth, adapter });

	await account.initialize();
	account.openLoginFlow();
	await account.submitLogin('user-a@example.com');
	const verifyPromise = account.verifyOtpCode('12345678');
	await waitFor(() => account.getState().contextTransition !== null);

	assert.equal(account.getState().user, null);
	assert.equal(account.getState().data, 'anonymous');
	assert.equal(account.getState().phase, 'loading-data');
	assert.equal(loadSignal?.aborted, false);

	await account.cancelContextTransition();
	await verifyPromise;

	assert.equal(loadSignal?.aborted, true);
	assert.equal(adapterRestores, 1);
	assert.equal(account.getState().contextTransition, null);
	assert.equal(account.getState().user, null);
	assert.equal(account.getState().data, 'anonymous');
	assert.equal(account.getState().sessions[0]?.active, false);
	account.destroy();
});

test('cancels account switching by restoring the previously active session', async () => {
	const activeB = { ...userB, active: true };
	const auth = createAuthClient({
		activeSession: userA,
		sessions: [userA, userB]
	});
	const switchCalls: string[] = [];
	auth.switchSession = async (sessionId) => {
		switchCalls.push(sessionId);
		return sessionId === activeB.sessionId
			? { activeSession: activeB, sessions: [{ ...userA, active: false }, activeB] }
			: { activeSession: userA, sessions: [userA, { ...userB, active: false }] };
	};
	let targetLoadSignal: AbortSignal | undefined;
	const adapter: AccountDataAdapter<string> = {
		...createDataAdapter(),
		loadAccount(user, options) {
			if (user.userId === 'user-b') {
				targetLoadSignal = options?.signal;
				return new Promise((_resolve, reject) => {
					targetLoadSignal?.addEventListener('abort', () =>
						reject(new DOMException('Aborted', 'AbortError'))
					);
				});
			}
			return Promise.resolve(`account:${user.userId}`);
		}
	};
	const account = createAccountDataController({ authClient: auth, adapter });

	await account.initialize();
	await account.openLoginOrAccountList();
	const switchPromise = account.selectAccountSession(activeB.sessionId);
	await waitFor(() => account.getState().contextTransition !== null);

	assert.equal(account.getState().user?.userId, 'user-a');
	assert.equal(account.getState().data, 'account:user-a');
	await account.cancelContextTransition();
	await switchPromise;

	assert.deepEqual(switchCalls, ['session-b', 'session-a']);
	assert.equal(targetLoadSignal?.aborted, true);
	assert.equal(account.getState().user?.userId, 'user-a');
	assert.equal(account.getState().data, 'account:user-a');
	assert.equal(account.getState().contextTransition, null);
	assert.equal(account.getState().accountBusySessionId, null);
	assert.equal(account.getState().accountModalOpen, true);
	account.destroy();
});

test('cross-tab auth updates supersede and abort a pending account transition', async () => {
	const activeB = { ...userB, active: true };
	const userC = createSession('session-c', 'user-c', true);
	let sessionResponse: AuthSessionResponse = { activeSession: userA, sessions: [userA, userB] };
	const channelName = `account-test-${Math.random()}`;
	const auth = createAuthClient({ activeSession: userA, sessions: [userA, userB] });
	auth.getSession = async () => sessionResponse;
	auth.switchSession = async () => ({
		activeSession: activeB,
		sessions: [{ ...userA, active: false }, activeB]
	});
	let targetLoadSignal: AbortSignal | undefined;
	const adapter: AccountDataAdapter<string> = {
		...createDataAdapter(),
		loadAccount(user, options) {
			if (user.userId === 'user-b') {
				targetLoadSignal = options?.signal;
				return new Promise((_resolve, reject) => {
					targetLoadSignal?.addEventListener('abort', () =>
						reject(new DOMException('Aborted', 'AbortError'))
					);
				});
			}
			return Promise.resolve(`account:${user.userId}`);
		}
	};
	const account = createAccountDataController({ authClient: auth, adapter, channelName });
	const externalChannel = new BroadcastChannel(channelName);

	try {
		await account.initialize();
		const switchPromise = account.selectAccountSession(activeB.sessionId);
		await waitFor(() => account.getState().contextTransition !== null);
		sessionResponse = {
			activeSession: userC,
			sessions: [{ ...userA, active: false }, { ...activeB, active: false }, userC]
		};
		externalChannel.postMessage({
			type: 'auth-session-updated',
			sourceTabId: 'another-tab',
			userId: userC.userId,
			sessionId: userC.sessionId
		});
		await waitFor(() => account.getState().data === 'account:user-c');
		await account.cancelContextTransition();
		await switchPromise;

		assert.equal(targetLoadSignal?.aborted, true);
		assert.equal(account.getState().contextTransition, null);
		assert.equal(account.getState().accountBusySessionId, null);
		assert.equal(account.getState().user?.userId, userC.userId);
		assert.equal(account.getState().data, 'account:user-c');
	} finally {
		externalChannel.close();
		account.destroy();
	}
});

test('commits the target context only after its data finishes loading', async () => {
	const activeB = { ...userB, active: true };
	const auth = createAuthClient({ activeSession: userA, sessions: [userA, userB] });
	auth.switchSession = async () => ({
		activeSession: activeB,
		sessions: [{ ...userA, active: false }, activeB]
	});
	let finishLoad: ((value: string) => void) | null = null;
	const adapter: AccountDataAdapter<string> = {
		...createDataAdapter(),
		loadAccount(user, options) {
			if (user.userId === 'user-b') {
				return new Promise((resolve, reject) => {
					finishLoad = resolve;
					options?.signal?.addEventListener('abort', () =>
						reject(new DOMException('Aborted', 'AbortError'))
					);
				});
			}
			return Promise.resolve(`account:${user.userId}`);
		}
	};
	const account = createAccountDataController({ authClient: auth, adapter });

	await account.initialize();
	const switchPromise = account.selectAccountSession(activeB.sessionId);
	await waitFor(() => account.getState().contextTransition !== null);
	assert.equal(account.getState().user?.userId, 'user-a');
	assert.equal(account.getState().data, 'account:user-a');
	finishLoad?.('account:user-b');
	await switchPromise;

	assert.equal(account.getState().user?.userId, 'user-b');
	assert.equal(account.getState().data, 'account:user-b');
	assert.equal(account.getState().phase, 'ready');
	assert.equal(account.getState().contextTransition, null);
	account.destroy();
});

test('restores the prior auth and data context when target loading fails', async () => {
	const activeB = { ...userB, active: true };
	const auth = createAuthClient({ activeSession: userA, sessions: [userA, userB] });
	const switchCalls: string[] = [];
	auth.switchSession = async (sessionId) => {
		switchCalls.push(sessionId);
		return sessionId === activeB.sessionId
			? { activeSession: activeB, sessions: [{ ...userA, active: false }, activeB] }
			: { activeSession: userA, sessions: [userA, { ...userB, active: false }] };
	};
	const adapter: AccountDataAdapter<string> = {
		...createDataAdapter(),
		async loadAccount(user) {
			if (user.userId === 'user-b') throw new Error('Target data could not be loaded.');
			return `account:${user.userId}`;
		}
	};
	const account = createAccountDataController({ authClient: auth, adapter });

	await account.initialize();
	await account.selectAccountSession(activeB.sessionId);

	assert.deepEqual(switchCalls, ['session-b', 'session-a']);
	assert.equal(account.getState().user?.userId, 'user-a');
	assert.equal(account.getState().data, 'account:user-a');
	assert.equal(account.getState().phase, 'ready');
	assert.equal(account.getState().contextTransition, null);
	assert.match(account.getState().authMessage, /Target data could not be loaded/);
	account.destroy();
});

test('ignores repeated email submissions while the first request is pending', async () => {
	let resolveLogin: (() => void) | null = null;
	let loginCalls = 0;
	const auth = createAuthClient({
		activeSession: null,
		sessions: [],
		loginPromise: new Promise<void>((resolve) => {
			resolveLogin = resolve;
		})
	});
	const originalLogin = auth.login;
	auth.login = async (email) => {
		loginCalls += 1;
		return originalLogin(email);
	};
	const account = createAccountDataController({ authClient: auth, adapter: createDataAdapter() });

	account.openLoginFlow();
	const firstSubmission = account.submitLogin('user@example.com');
	await account.submitLogin('user@example.com');
	assert.equal(loginCalls, 1);
	resolveLogin?.();
	await firstSubmission;
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

test('unauthorized failures refresh session, load anonymous data, and emit a notice', async () => {
	const notices: string[] = [];
	const auth = createAuthClient({
		activeSession: null,
		sessions: []
	});
	const adapter = createDataAdapter();
	const account = createAccountDataController({
		authClient: auth,
		adapter,
		onNotice: (message) => notices.push(message)
	});

	await account.initialize({ initialUser: userA });
	const handled = await account.handleAuthFailure(new Error('No active session.'));

	assert.equal(handled, true);
	assert.deepEqual(notices, ['Session expired']);
	assert.equal(account.getState().user, null);
	assert.equal(account.getState().data, 'anonymous');
	account.destroy();
});

test('ignores stale login verify responses after a newer session load starts', async () => {
	let resolveVerify: ((response: AuthSessionResponse) => void) | null = null;
	const auth = createAuthClient({
		activeSession: userB,
		sessions: [userB],
		verifyPromise: new Promise((resolve) => {
			resolveVerify = resolve;
		})
	});
	const adapter = createDataAdapter();
	const account = createAccountDataController({ authClient: auth, adapter });

	account.openLoginFlow();
	const verifyPromise = account.verifyOtpCode('12345678');
	await account.initialize();
	resolveVerify?.({ activeSession: userA, sessions: [userA] });
	await verifyPromise;

	assert.equal(account.getState().user?.userId, 'user-b');
	assert.equal(account.getState().data, 'account:user-b');
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
	verifyPromise?: Promise<AuthSessionResponse>;
	loginPromise?: Promise<void>;
	useAnonymousResponse?: AuthSessionResponse;
}): AuthClient {
	return {
		async login() {
			if (options.loginPromise) {
				await options.loginPromise;
			}
			if (options.loginError) {
				throw options.loginError;
			}
			return { sent: true };
		},
		async verify() {
			if (options.verifyPromise) {
				return options.verifyPromise;
			}
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
		async getAccounts() {
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
		async useAnonymous() {
			return (
				options.useAnonymousResponse ?? {
					activeSession: null,
					sessions: options.sessions.map((session) => ({ ...session, active: false }))
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
		},
		getBroadcastRelayUrl() {
			return 'https://api.example.test/v1/auth/broadcast-frame';
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
