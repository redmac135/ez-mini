import {
	clearCachedAuthSessionForUser as clearSessionForUser,
	normalizeCachedAuthSession,
	readCachedAuthSession as readSession,
	writeCachedAuthSession as writeSession,
	type AuthSessionCacheStorage
} from '@ez/auth';

export const LAST_AUTH_SESSION_KEY = 'blank-last-auth-session';
export type SessionCacheStorage = AuthSessionCacheStorage;
export { normalizeCachedAuthSession };

export function readCachedAuthSession(storage: SessionCacheStorage) {
	return readSession(storage, LAST_AUTH_SESSION_KEY);
}

export function writeCachedAuthSession(
	storage: SessionCacheStorage,
	nextUser: Parameters<typeof writeSession>[1]
) {
	writeSession(storage, nextUser, LAST_AUTH_SESSION_KEY);
}

export function clearCachedAuthSessionForUser(storage: SessionCacheStorage, userId: string) {
	clearSessionForUser(storage, userId, LAST_AUTH_SESSION_KEY);
}
