import type { AuthSessionSummary } from '@ez/auth';

export const LAST_AUTH_SESSION_KEY = 'blank-last-auth-session';

export interface SessionCacheStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export function readCachedAuthSession(storage: SessionCacheStorage): AuthSessionSummary | null {
	try {
		const raw = storage.getItem(LAST_AUTH_SESSION_KEY);
		if (!raw) {
			return null;
		}

		return normalizeCachedAuthSession(JSON.parse(raw));
	} catch {
		return null;
	}
}

export function writeCachedAuthSession(
	storage: SessionCacheStorage,
	nextUser: AuthSessionSummary | null
) {
	try {
		if (!nextUser) {
			storage.removeItem(LAST_AUTH_SESSION_KEY);
			return;
		}

		storage.setItem(LAST_AUTH_SESSION_KEY, JSON.stringify(nextUser));
	} catch (error) {
		void error;
	}
}

export function clearCachedAuthSessionForUser(storage: SessionCacheStorage, userId: string) {
	try {
		if (readCachedAuthSession(storage)?.userId === userId) {
			storage.removeItem(LAST_AUTH_SESSION_KEY);
		}
	} catch (error) {
		void error;
	}
}

export function normalizeCachedAuthSession(value: unknown): AuthSessionSummary | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

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
