import type { EditorSession } from './core/session';

export type AppSyncStatus = 'offline' | 'syncing' | 'synced' | 'saved_locally' | 'error';

export function hasUnsyncedRealPages(session: EditorSession) {
	return session.pages.some(
		(page) => !page.isEphemeral && page.deletedAt === null && page.syncStatus !== 'synced'
	);
}

export function getSettledAppSyncStatus(
	session: EditorSession,
	isOnline: boolean
): Extract<AppSyncStatus, 'offline' | 'synced' | 'saved_locally'> {
	if (!isOnline) {
		return 'offline';
	}

	return hasUnsyncedRealPages(session) ? 'saved_locally' : 'synced';
}

export function getSyncStatusLabel(status: AppSyncStatus) {
	switch (status) {
		case 'offline':
			return 'Offline';
		case 'syncing':
			return 'Syncing…';
		case 'synced':
			return 'Synced';
		case 'saved_locally':
			return 'Saved locally';
		case 'error':
			return 'Sync error';
	}
}
