import type { AuthSessionSummary } from './index.ts';

export interface AuthSessionCacheStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export const AUTH_SESSION_CACHE_KEY = 'mini-auth-session';

export function readCachedAuthSession(
	storage: AuthSessionCacheStorage,
	key = AUTH_SESSION_CACHE_KEY
): AuthSessionSummary | null {
	try {
		const raw = storage.getItem(key);
		return raw ? normalizeCachedAuthSession(JSON.parse(raw)) : null;
	} catch {
		return null;
	}
}

export function writeCachedAuthSession(
	storage: AuthSessionCacheStorage,
	nextUser: AuthSessionSummary | null,
	key = AUTH_SESSION_CACHE_KEY
) {
	try {
		if (nextUser) storage.setItem(key, JSON.stringify(nextUser));
		else storage.removeItem(key);
	} catch {
		// Storage may be unavailable in private browsing or under quota pressure.
	}
}

export function clearCachedAuthSessionForUser(
	storage: AuthSessionCacheStorage,
	userId: string,
	key = AUTH_SESSION_CACHE_KEY
) {
	if (readCachedAuthSession(storage, key)?.userId === userId) {
		try {
			storage.removeItem(key);
		} catch {
			// Storage is a cache; auth state remains authoritative.
		}
	}
}

export function normalizeCachedAuthSession(value: unknown): AuthSessionSummary | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	if (
		typeof record.sessionId !== 'string' ||
		typeof record.userId !== 'string' ||
		!(typeof record.email === 'string' || record.email === null) ||
		typeof record.createdAt !== 'number' ||
		typeof record.lastUsedAt !== 'number' ||
		typeof record.active !== 'boolean'
	) {
		return null;
	}
	return {
		sessionId: record.sessionId,
		userId: record.userId,
		email: record.email,
		username:
			typeof record.username === 'string' ? record.username : (record.email ?? record.userId),
		createdAt: record.createdAt,
		lastUsedAt: record.lastUsedAt,
		active: record.active
	};
}
