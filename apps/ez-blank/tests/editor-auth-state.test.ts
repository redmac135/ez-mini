import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEditorAuthState } from '../src/lib/auth/editor-auth-state.ts';
import { DEFAULT_PREFERENCES } from '../src/lib/editor/core/preferences.ts';
import { createPage, createSession, type EditorSession } from '../src/lib/editor/core/session.ts';
import type { PagesApi } from '../src/lib/editor/sync.ts';

type RemotePageRow = Awaited<ReturnType<PagesApi['listPages']>>[number];

const user = {
	sessionId: 'session-a',
	userId: 'user-a',
	email: 'a@example.test',
	username: 'a@example.test',
	createdAt: 1,
	lastUsedAt: 2,
	active: true
};

function buildPagesApi(remotePages: RemotePageRow[], activePageId: string | null): PagesApi {
	return {
		async listPages() {
			return remotePages;
		},
		async upsertPage(page) {
			return page;
		},
		async getSettings() {
			return {
				user_id: 'user-a',
				active_page_id: activePageId
			};
		},
		async updateSettings(settings) {
			return {
				user_id: 'user-a',
				active_page_id: settings.active_page_id
			};
		}
	};
}

function buildLoader(
	options: {
		userLocal?: EditorSession | null;
		anonymousSession?: EditorSession;
		alreadyPrompted?: boolean;
	} = {}
) {
	return {
		async loadUserState() {
			return options.userLocal ?? null;
		},
		async loadAnonymousState() {
			return options.anonymousSession ?? createSession();
		},
		async hasPromptedForAnonymousImport() {
			return options.alreadyPrompted ?? false;
		},
		async loadPreferences() {
			return DEFAULT_PREFERENCES;
		}
	};
}

test('editor auth state loads anonymous state without touching remote pages', async () => {
	const anonymousSession = createSession();
	const remoteCalls: string[] = [];
	const pagesApi: PagesApi = {
		async listPages() {
			remoteCalls.push('listPages');
			return [];
		},
		async upsertPage(page) {
			remoteCalls.push('upsertPage');
			return page;
		},
		async getSettings() {
			remoteCalls.push('getSettings');
			return null;
		},
		async updateSettings(settings) {
			remoteCalls.push('updateSettings');
			return {
				user_id: 'user-a',
				active_page_id: settings.active_page_id
			};
		}
	};

	const result = await loadEditorAuthState({
		user: null,
		loader: buildLoader({ anonymousSession }),
		pagesApi,
		isOnline: true
	});

	assert.equal(result.session, anonymousSession);
	assert.equal(result.appSyncStatus, 'synced');
	assert.equal(result.importPromptOpen, false);
	assert.deepEqual(remoteCalls, []);
});

test('startup auth state publishes local data and leaves remote sync for the background controller', async () => {
	let remoteCalls = 0;
	let localStateLoaded = false;
	const localSession = createSession(user.userId);
	const result = await loadEditorAuthState({
		user,
		loader: buildLoader({ userLocal: localSession }),
		pagesApi: {
			...buildPagesApi([], null),
			async listPages() {
				remoteCalls += 1;
				return [];
			}
		},
		isOnline: true,
		onLocalStateLoaded(state) {
			localStateLoaded = state.session === localSession;
		}
	});

	assert.equal(localStateLoaded, true);
	assert.equal(result.session, localSession);
	assert.equal(result.pulledRemoteChanges, false);
	assert.equal(remoteCalls, 0);
});

test('editor auth state loads initial remote context when no local account state exists', async () => {
	const remotePage = {
		id: 'remote-page',
		user_id: 'user-a',
		title: 'Remote',
		content: 'Remote body',
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-02T00:00:00.000Z',
		deleted_at: null
	};
	const anonymousPage = createPage('Anonymous body');
	const anonymousSession = {
		pages: [anonymousPage],
		activePageId: anonymousPage.id
	};
	const result = await loadEditorAuthState({
		user,
		loader: buildLoader({ anonymousSession }),
		pagesApi: buildPagesApi([remotePage], 'remote-page'),
		isOnline: true,
		signal: new AbortController().signal
	});

	assert.equal(result.session.activePageId, 'remote-page');
	assert.equal(result.session.pages[0]?.id, 'remote-page');
	assert.equal(result.session.pages[0]?.syncStatus, 'synced');
	assert.equal(result.importPromptOpen, true);
	assert.equal(result.pendingAnonymousImportSession, anonymousSession);
	assert.equal(result.pulledRemoteChanges, true);
});
