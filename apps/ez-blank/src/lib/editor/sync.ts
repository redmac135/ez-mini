import { createSyncEngine } from '@ez/sync';
import {
	createPage,
	ensureValidActivePage,
	sortPagesByRecency,
	type EditorPage,
	type EditorSession
} from './core/session';

interface RemotePageRow {
	id: string;
	user_id: string;
	title: string;
	content: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

interface RemoteUserSettingsRow {
	user_id: string;
	active_page_id: string | null;
	created_at?: string;
	updated_at?: string;
}

export interface PagesApi {
	listPages(options?: { since?: string | null }): Promise<RemotePageRow[]>;
	upsertPage(page: RemotePageRow): Promise<RemotePageRow>;
	getSettings(): Promise<RemoteUserSettingsRow | null>;
	updateSettings(settings: { active_page_id: string | null }): Promise<RemoteUserSettingsRow>;
}

export interface SyncRunResult {
	session: EditorSession;
	pushedCount: number;
	pulledCount: number;
	conflictCount: number;
	pushedIds: string[];
	pulledIds: string[];
	conflictIds: string[];
}

let syncInProgress = false;

export function isSyncInProgress() {
	return syncInProgress;
}

export function reconcileSyncResult(
	currentSession: EditorSession,
	syncSourceSession: EditorSession,
	syncedSession: EditorSession
): EditorSession {
	const sourceById = new Map(syncSourceSession.pages.map((page) => [page.id, page]));
	const syncedById = new Map(syncedSession.pages.map((page) => [page.id, page]));
	const mergedPages: EditorPage[] = [];
	const seenPageIds = new Set<string>();

	for (const currentPage of currentSession.pages) {
		const sourcePage = sourceById.get(currentPage.id) ?? null;
		const syncedPage = syncedById.get(currentPage.id) ?? null;

		if (!sourcePage || !syncedPage) {
			mergedPages.push(currentPage);
			seenPageIds.add(currentPage.id);
			continue;
		}

		if (!hasPageChangedSinceSource(currentPage, sourcePage)) {
			mergedPages.push(preserveLocalSelection(syncedPage, currentPage));
			seenPageIds.add(currentPage.id);
			continue;
		}

		if (pageStatesMatch(sourcePage, toRemoteShape(syncedPage))) {
			mergedPages.push(mergeSyncedBaselineIntoCurrentPage(currentPage, syncedPage));
			seenPageIds.add(currentPage.id);
			continue;
		}

		mergedPages.push(currentPage);
		seenPageIds.add(currentPage.id);
	}

	for (const syncedPage of syncedSession.pages) {
		if (seenPageIds.has(syncedPage.id)) {
			continue;
		}

		mergedPages.push(syncedPage);
	}

	return ensureValidActivePage({
		pages: sortPagesByRecency(mergedPages),
		activePageId: currentSession.activePageId
	});
}

// One manual sync pass works against one remote snapshot.
// We pull once, decide everything against that snapshot, trust write responses,
// and only then build the next local session.
export async function syncUserPages(
	api: PagesApi,
	userId: string,
	localSession: EditorSession,
	now = new Date()
): Promise<SyncRunResult> {
	if (syncInProgress) {
		throw new Error('Sync already in progress.');
	}

	syncInProgress = true;

	try {
		let nextActivePageId = localSession.activePageId;
		let savedPages: EditorPage[] = [];
		const engine = createSyncEngine<EditorPage, RemotePageRow>({
			pull: (since) => api.listPages({ since }),
			push: (page) => api.upsertPage(page),
			getLocal: async () =>
				sortPagesByRecency(localSession.pages.filter((page) => page.userId === userId)),
			saveLocal: async (pages) => {
				savedPages = sortPagesByRecency(pages);
			},
			toRemote: (page) => toRemoteShape({ ...page, userId }),
			toLocal: (remote, existing) => toSyncedLocalPage(remote, existing ?? null),
			getId: (page) => page.id,
			getSince: (pages) => getSafeIncrementalSince(pages, userId),
			getLocalUpdatedAt: (page) => page.updatedAt,
			getRemoteUpdatedAt: (page) => page.updated_at,
			getLocalDeletedAt: (page) => page.deletedAt,
			getRemoteDeletedAt: (page) => page.deleted_at,
			getLastSyncedAt: (page) => page.lastSyncedAt,
			setLastSyncedAt: (page, value) => ({ ...page, lastSyncedAt: value }),
			shouldSync: (page) => !page.isEphemeral,
			shouldKeepRemote: shouldKeepRemotePageLocally,
			areStatesEqual: pageStatesMatch,
			onConflict: async (localPage, remote, helpers) => {
				const nextPages: EditorPage[] = [];
				const remotePage = toSyncedLocalPage(remote, localPage);
				if (shouldKeepRemotePageLocally(remote)) {
					nextPages.push(remotePage);
				}

				const syncedFork = await helpers.push(forkConflictPage(localPage, now));
				nextPages.push(syncedFork);

				if (localSession.activePageId === localPage.id && remotePage.deletedAt !== null) {
					nextActivePageId = syncedFork.id;
				}

				return nextPages;
			}
		});
		const result = await engine.sync();

		const nextSession = ensureValidActivePage({
			pages: savedPages,
			activePageId: nextActivePageId
		});
		return {
			session: nextSession,
			pushedCount: result.pushed,
			pulledCount: result.pulled,
			conflictCount: result.conflicts,
			pushedIds: result.pushedIds,
			pulledIds: result.pulledIds,
			conflictIds: result.conflictIds
		};
	} finally {
		syncInProgress = false;
	}
}

export async function fetchRemoteActivePageId(api: PagesApi): Promise<string | null> {
	return (await api.getSettings())?.active_page_id ?? null;
}

export function forkConflictPage(page: EditorPage, now = new Date()): EditorPage {
	const timestamp = now.toISOString();
	const fork = createPage(page.content, {
		userId: page.userId,
		now: timestamp,
		isEphemeral: false
	});
	return {
		...fork,
		title: `${page.title} ${buildConflictSuffix(now)}`.trim(),
		content: page.content,
		text: page.content,
		selectionStart: page.selectionStart,
		selectionEnd: page.selectionEnd,
		deletedAt: null,
		syncStatus: 'dirty',
		isEphemeral: false
	};
}

export async function pushRemoteActivePageId(api: PagesApi, activePageId: string) {
	await api.updateSettings({ active_page_id: activePageId });
}

function toSyncedLocalPage(remote: RemotePageRow, localPage: EditorPage | null): EditorPage {
	const base =
		localPage ??
		createPage(remote.content, {
			id: remote.id,
			userId: remote.user_id,
			now: remote.created_at,
			isEphemeral: false
		});

	return {
		...base,
		id: remote.id,
		userId: remote.user_id,
		title: remote.title,
		content: remote.content,
		text: remote.content,
		createdAt: remote.created_at,
		updatedAt: remote.updated_at,
		deletedAt: remote.deleted_at,
		lastSyncedAt: remote.updated_at,
		lastKnownRemoteUpdatedAt: remote.updated_at,
		lastKnownRemoteDeletedAt: remote.deleted_at,
		syncStatus: 'synced',
		isEphemeral: false
	};
}

function preserveLocalSelection(page: EditorPage, selectionSource: EditorPage): EditorPage {
	return {
		...page,
		selectionStart: Math.max(0, Math.min(selectionSource.selectionStart, page.content.length)),
		selectionEnd: Math.max(0, Math.min(selectionSource.selectionEnd, page.content.length))
	};
}

function toRemoteShape(page: EditorPage): RemotePageRow {
	return {
		id: page.id,
		user_id: page.userId,
		title: page.title,
		content: page.content,
		created_at: page.createdAt,
		updated_at: page.updatedAt,
		deleted_at: page.deletedAt
	};
}

function hasPageChangedSinceSource(currentPage: EditorPage, sourcePage: EditorPage) {
	return (
		currentPage.title !== sourcePage.title ||
		currentPage.content !== sourcePage.content ||
		currentPage.deletedAt !== sourcePage.deletedAt ||
		currentPage.updatedAt !== sourcePage.updatedAt ||
		currentPage.isEphemeral !== sourcePage.isEphemeral
	);
}

function mergeSyncedBaselineIntoCurrentPage(
	currentPage: EditorPage,
	syncedPage: EditorPage
): EditorPage {
	const nextPage: EditorPage = {
		...currentPage,
		userId: syncedPage.userId,
		createdAt: syncedPage.createdAt,
		lastSyncedAt: syncedPage.lastSyncedAt,
		lastKnownRemoteUpdatedAt: syncedPage.lastKnownRemoteUpdatedAt,
		lastKnownRemoteDeletedAt: syncedPage.lastKnownRemoteDeletedAt
	};

	return {
		...nextPage,
		syncStatus:
			syncedPage.lastSyncedAt !== null && latestLocalMutationAt(nextPage) > syncedPage.lastSyncedAt
				? 'dirty'
				: 'synced'
	};
}

function latestLocalMutationAt(localPage: EditorPage) {
	return localPage.deletedAt && localPage.deletedAt > localPage.updatedAt
		? localPage.deletedAt
		: localPage.updatedAt;
}

function pageStatesMatch(localPage: EditorPage, remote: RemotePageRow) {
	return (
		localPage.title === remote.title &&
		localPage.content === remote.content &&
		(localPage.deletedAt ?? null) === (remote.deleted_at ?? null)
	);
}

function shouldKeepRemotePageLocally(remote: RemotePageRow) {
	return remote.deleted_at === null;
}

function getSafeIncrementalSince(pages: EditorPage[], userId: string) {
	const syncedPages = pages.filter(
		(page) => page.userId === userId && !page.isEphemeral && page.lastSyncedAt !== null
	);
	const unsyncedPage = pages.some(
		(page) => page.userId === userId && !page.isEphemeral && page.lastSyncedAt === null
	);

	if (syncedPages.length === 0 || unsyncedPage) {
		return null;
	}

	return syncedPages
		.map((page) => page.lastSyncedAt)
		.filter((value): value is string => value !== null)
		.sort()[0]!;
}

function buildConflictSuffix(now: Date) {
	const label = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(now);

	return `(Local conflict ${label})`;
}
