import type { AuthSessionSummary } from '@ez/auth';
import type { EditorPreferences } from '$lib/editor/core/preferences';
import {
	createSession,
	hasVisibleEphemeralActivePage,
	type EditorSession
} from '$lib/editor/core/session';
import { ANONYMOUS_USERID } from '$lib/editor/persistence/records';
import { getSettledAppSyncStatus, type AppSyncStatus } from '$lib/editor/app-sync-status';
import { fetchRemoteActivePageId, syncUserPages, type PagesApi } from '$lib/editor/sync';

export interface EditorAuthStateLoader {
	loadUserState(userId: string): Promise<EditorSession | null>;
	loadAnonymousState(): Promise<EditorSession>;
	hasPromptedForAnonymousImport(userId: string): Promise<boolean>;
	loadPreferences(userId: string): Promise<EditorPreferences>;
}

export interface LoadedEditorAuthState {
	user: AuthSessionSummary | null;
	session: EditorSession;
	preferences: EditorPreferences;
	appSyncStatus: AppSyncStatus;
	pendingAnonymousImportSession: EditorSession | null;
	importPromptOpen: boolean;
	pulledRemoteChanges: boolean;
}

export async function loadEditorAuthState(options: {
	user: AuthSessionSummary | null;
	loader: EditorAuthStateLoader;
	pagesApi: PagesApi;
	isOnline: boolean;
	onLocalStateLoaded?: (state: {
		session: EditorSession;
		preferences: EditorPreferences;
		appSyncStatus: AppSyncStatus;
	}) => void;
}): Promise<LoadedEditorAuthState> {
	if (!options.user) {
		const [anonymousSession, anonymousPreferences] = await Promise.all([
			options.loader.loadAnonymousState(),
			options.loader.loadPreferences(ANONYMOUS_USERID)
		]);
		const appSyncStatus = getSettledAppSyncStatus(anonymousSession, options.isOnline);
		options.onLocalStateLoaded?.({
			session: anonymousSession,
			preferences: anonymousPreferences,
			appSyncStatus
		});

		return {
			user: null,
			session: anonymousSession,
			preferences: anonymousPreferences,
			appSyncStatus,
			pendingAnonymousImportSession: null,
			importPromptOpen: false,
			pulledRemoteChanges: false
		};
	}

	const [userLocal, anonymousSession, alreadyPrompted, userPreferences] = await Promise.all([
		options.loader.loadUserState(options.user.userId),
		options.loader.loadAnonymousState(),
		options.loader.hasPromptedForAnonymousImport(options.user.userId),
		options.loader.loadPreferences(options.user.userId)
	]);
	const hasAnonymousData = anonymousSession.pages.some(
		(page) =>
			page.deletedAt === null && (page.content.trim().length > 0 || page.title !== 'Untitled')
	);

	const baseSession = userLocal ?? createSession(options.user.userId);
	options.onLocalStateLoaded?.({
		session: baseSession,
		preferences: userPreferences,
		appSyncStatus: getSettledAppSyncStatus(baseSession, options.isOnline)
	});

	const syncResult = await syncUserPages(options.pagesApi, options.user.userId, baseSession);
	const remoteActivePageId = await fetchRemoteActivePageId(options.pagesApi);
	const shouldPreserveLocalEphemeralPage = hasVisibleEphemeralActivePage(syncResult.session);
	const session =
		!shouldPreserveLocalEphemeralPage &&
		remoteActivePageId &&
		syncResult.session.pages.some(
			(page) => page.id === remoteActivePageId && page.deletedAt === null
		)
			? {
					...syncResult.session,
					activePageId: remoteActivePageId
				}
			: syncResult.session;

	return {
		user: options.user,
		session,
		preferences: userPreferences,
		appSyncStatus: getSettledAppSyncStatus(session, options.isOnline),
		pendingAnonymousImportSession: hasAnonymousData && !alreadyPrompted ? anonymousSession : null,
		importPromptOpen: hasAnonymousData && !alreadyPrompted,
		pulledRemoteChanges: syncResult.pulledCount > 0
	};
}
