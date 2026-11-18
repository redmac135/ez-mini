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
	revision: number;
}

interface RemoteUserSettingsRow {
	user_id: string;
	active_page_id: string | null;
	created_at?: string;
	updated_at?: string;
}

export interface PagesApi {
	listPages(options?: {
		since?: string | null;
		signal?: AbortSignal;
	}): Promise<{ pages: RemotePageRow[]; cursor: string }>;
	upsertPage(
		page: Omit<RemotePageRow, 'revision'> & { expected_revision: number | null },
		options?: { signal?: AbortSignal }
	): Promise<{ page: RemotePageRow | null; conflict: boolean }>;
	getSettings(options?: { signal?: AbortSignal }): Promise<RemoteUserSettingsRow | null>;
	updateSettings(
		settings: { active_page_id: string | null },
		options?: { signal?: AbortSignal }
	): Promise<RemoteUserSettingsRow>;
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
			// A page removed by the sync stays removed unless it was edited while
			// the request was in flight. In that case its old revision ensures the
			// next CAS preserves the new edit as a conflict.
			if (!sourcePage || hasPageChangedSinceSource(currentPage, sourcePage)) {
				mergedPages.push(currentPage);
			}
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
		syncCursor: syncedSession.syncCursor,
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
	now = new Date(),
	signal?: AbortSignal
): Promise<SyncRunResult> {
	if (syncInProgress) {
		throw new Error('Sync already in progress.');
	}

	syncInProgress = true;

	try {
		let nextActivePageId = localSession.activePageId;
		const snapshot = await api.listPages({ since: localSession.syncCursor ?? null, signal });
		if (
			!snapshot ||
			!Array.isArray(snapshot.pages) ||
			typeof snapshot.cursor !== 'string' ||
			!/^\d+$/.test(snapshot.cursor)
		) {
			throw new Error('The server does not support safe page sync. Please update and retry.');
		}
		if (localSession.syncCursor && BigInt(snapshot.cursor) < BigInt(localSession.syncCursor))
			throw new Error('The server sync cursor moved backwards. Your local drafts were preserved.');
		const remoteById = new Map(
			snapshot.pages.map((page) => {
				validateRemotePage(page, userId);
				return [page.id, page] as const;
			})
		);
		const pages: EditorPage[] = [];
		const pushedIds: string[] = [];
		const pulledIds: string[] = [];
		const conflictIds: string[] = [];

		async function write(local: EditorPage) {
			const response = await api.upsertPage(
				{ ...toRemoteShape(local), expected_revision: local.serverRevision ?? null },
				{ signal }
			);
			if (!response || typeof response.conflict !== 'boolean')
				throw new Error('Invalid page sync response.');
			if (response.page) {
				validateRemotePage(response.page, userId);
				if (response.page.id !== local.id) throw new Error('Invalid page sync response.');
			}
			if (!response.conflict && !response.page) throw new Error('Missing page sync response.');
			if (!response.conflict) pushedIds.push(local.id);
			return response;
		}

		async function conflict(local: EditorPage, remote: RemotePageRow) {
			conflictIds.push(local.id);
			if (remote.deleted_at === null) pages.push(toSyncedLocalPage(remote, local));
			const fork = forkConflictPage(local, now);
			const written = await write(fork);
			if (written.conflict || !written.page)
				throw new Error('Could not save the conflict copy. Please retry.');
			pages.push(toSyncedLocalPage(written.page, fork));
			if (localSession.activePageId === local.id && remote.deleted_at !== null)
				nextActivePageId = fork.id;
		}

		for (const local of localSession.pages.filter((page) => page.userId === userId)) {
			if (local.isEphemeral) {
				pages.push(local);
				continue;
			}
			const remote = remoteById.get(local.id);
			remoteById.delete(local.id);
			if (remote && pageStatesMatch(local, remote)) {
				if (remote.deleted_at === null) pages.push(toSyncedLocalPage(remote, local));
				continue;
			}
			const dirty = local.syncStatus !== 'synced';
			if (remote && (local.serverRevision == null || remote.revision !== local.serverRevision)) {
				if (dirty || local.serverRevision == null) await conflict(local, remote);
				else {
					if (remote.deleted_at === null) pages.push(toSyncedLocalPage(remote, local));
					pulledIds.push(local.id);
				}
				continue;
			}
			if (!dirty && local.serverRevision != null) {
				pages.push(local);
				continue;
			}
			const written = await write(local);
			if (written.conflict) {
				if (!written.page)
					throw new Error('The page changed or is unavailable. Your local draft was preserved.');
				if (pageStatesMatch(local, written.page)) {
					if (written.page.deleted_at === null) pages.push(toSyncedLocalPage(written.page, local));
				} else await conflict(local, written.page);
			} else if (written.page!.deleted_at === null)
				pages.push(toSyncedLocalPage(written.page!, local));
		}
		for (const remote of remoteById.values()) {
			if (remote.deleted_at === null) {
				pages.push(toSyncedLocalPage(remote, null));
				pulledIds.push(remote.id);
			}
		}
		if (pages.length === 0) pages.push(createPage('', { userId, isEphemeral: true }));
		return {
			session: ensureValidActivePage({
				pages: sortPagesByRecency(pages),
				activePageId: nextActivePageId,
				syncCursor: snapshot.cursor
			}),
			pushedCount: pushedIds.length,
			pulledCount: pulledIds.length,
			conflictCount: conflictIds.length,
			pushedIds,
			pulledIds,
			conflictIds
		};
	} finally {
		syncInProgress = false;
	}
}

export async function fetchRemoteActivePageId(
	api: PagesApi,
	signal?: AbortSignal
): Promise<string | null> {
	return (await api.getSettings({ signal }))?.active_page_id ?? null;
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
		serverRevision: remote.revision,
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

function toRemoteShape(page: EditorPage): Omit<RemotePageRow, 'revision'> {
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
		currentPage.editGeneration !== sourcePage.editGeneration ||
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
		serverRevision: syncedPage.serverRevision,
		lastKnownRemoteUpdatedAt: syncedPage.lastKnownRemoteUpdatedAt,
		lastKnownRemoteDeletedAt: syncedPage.lastKnownRemoteDeletedAt
	};

	return { ...nextPage, syncStatus: 'dirty' };
}

function pageStatesMatch(localPage: EditorPage, remote: Omit<RemotePageRow, 'revision'>) {
	return (
		localPage.title === remote.title &&
		localPage.content === remote.content &&
		(localPage.deletedAt ?? null) === (remote.deleted_at ?? null)
	);
}

function validateRemotePage(page: RemotePageRow, userId: string) {
	if (
		!page ||
		page.user_id !== userId ||
		typeof page.id !== 'string' ||
		!Number.isSafeInteger(page.revision) ||
		page.revision < 1 ||
		typeof page.content !== 'string' ||
		typeof page.title !== 'string' ||
		typeof page.created_at !== 'string' ||
		typeof page.updated_at !== 'string' ||
		(page.deleted_at !== null && typeof page.deleted_at !== 'string')
	) {
		throw new Error('Invalid page sync response. Your local drafts were preserved.');
	}
}

function buildConflictSuffix(now: Date) {
	const label = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(now);

	return `(Local conflict ${label})`;
}
