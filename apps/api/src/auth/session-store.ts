import { clearCookie, parseCookies, setCookie } from '../http/cookies.ts';
import { ApiError } from '../http/errors.ts';
import { supabaseAuth } from '../supabase/client.ts';
import type {
	Env,
	PublicSession,
	RequestContext,
	StoredSession,
	SupabaseSessionResponse
} from '../types.ts';

export const DEVICE_COOKIE = 'ez_mini_device_id';
export const ACTIVE_SESSION_COOKIE = 'ez_mini_active_session_id';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;

export async function getRequestContext(
	request: Request,
	env: Env,
	headers: Headers
): Promise<RequestContext> {
	const cookies = parseCookies(request.headers.get('cookie'));
	const deviceId = cookies.get(DEVICE_COOKIE) ?? crypto.randomUUID();
	if (!cookies.has(DEVICE_COOKIE)) {
		setCookie(headers, DEVICE_COOKIE, deviceId, env);
	}

	return {
		deviceId,
		activeSessionId: cookies.get(ACTIVE_SESSION_COOKIE) ?? null,
		headers
	};
}

export async function requireActiveSession(env: Env, context: RequestContext) {
	if (!context.activeSessionId) {
		throw new ApiError(401, 'No active session.');
	}

	const session = await getOwnedSession(env, context.deviceId, context.activeSessionId);
	return refreshStoredSession(env, session, false);
}

export async function refreshStoredSession(
	env: Env,
	session: StoredSession,
	touchLastUsedAt = false
) {
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (session.expiresAt && session.expiresAt - nowSeconds > 60) {
		if (!touchLastUsedAt) return session;
		const touchedSession = { ...session, lastUsedAt: Date.now() };
		await putSession(env, touchedSession);
		return touchedSession;
	}

	const refreshed = await supabaseAuth<SupabaseSessionResponse>(
		env,
		'/token?grant_type=refresh_token',
		{
			method: 'POST',
			body: { refresh_token: session.supabaseRefreshToken }
		}
	);
	const nextSession = {
		...session,
		supabaseAccessToken: refreshed.access_token,
		supabaseRefreshToken: refreshed.refresh_token,
		displayName: getPersistedDisplayName(refreshed.user.user_metadata) ?? session.displayName,
		expiresAt: refreshed.expires_at ?? session.expiresAt,
		lastUsedAt: touchLastUsedAt ? Date.now() : session.lastUsedAt
	};
	await putSession(env, nextSession);
	return nextSession;
}

export async function getSessionResponse(env: Env, context: RequestContext) {
	let activeSession: StoredSession | null = null;
	if (context.activeSessionId) {
		try {
			activeSession = await refreshStoredSession(
				env,
				await getOwnedSession(env, context.deviceId, context.activeSessionId),
				false
			);
		} catch (error) {
			if (!isConfirmedInvalidSessionError(error)) throw error;
			activeSession = null;
			context.activeSessionId = null;
			clearActiveSession(context.headers, env);
		}
	}

	const storedSessions = await listDeviceSessions(env, context.deviceId);
	const sessions = moveActiveSessionFirst(
		storedSessions.map((session) =>
			activeSession?.sessionId === session.sessionId ? activeSession : session
		),
		context.activeSessionId
	);
	return {
		activeSession:
			sessions
				.map((session) => toPublicSession(session, context.activeSessionId))
				.find((session) => session.sessionId === context.activeSessionId) ?? null,
		sessions: sessions.map((session) => toPublicSession(session, context.activeSessionId))
	};
}

export async function getAccountSessionsResponse(env: Env, context: RequestContext) {
	const storedSessions = await listDeviceSessions(env, context.deviceId);
	const sessions = moveActiveSessionFirst(
		await Promise.all(
			storedSessions.map(async (storedSession) => {
				try {
					const session = await refreshStoredSession(env, storedSession, false);
					return await refreshDisplayName(env, session);
				} catch {
					return storedSession;
				}
			})
		),
		context.activeSessionId
	);
	return {
		activeSession:
			sessions
				.map((session) => toPublicSession(session, context.activeSessionId))
				.find((session) => session.sessionId === context.activeSessionId) ?? null,
		sessions: sessions.map((session) => toPublicSession(session, context.activeSessionId))
	};
}

async function refreshDisplayName(env: Env, session: StoredSession) {
	const user = await supabaseAuth<{
		user_metadata?: Record<string, unknown>;
	}>(env, '/user', {
		method: 'GET',
		accessToken: session.supabaseAccessToken
	});
	const displayName = getPersistedDisplayName(user?.user_metadata) || session.displayName;
	if (displayName === session.displayName) return session;
	const updatedSession = { ...session, displayName };
	await putSession(env, updatedSession);
	return updatedSession;
}

export async function listDeviceSessions(env: Env, deviceId: string) {
	const list = await env.SESSIONS.list<StoredSession>({ prefix: sessionKeyPrefix(deviceId) });
	const sessions = await Promise.all(
		list.keys.map((entry) => env.SESSIONS.get(entry.name, 'json'))
	);
	return sessions
		.filter((session): session is StoredSession => isStoredSession(session))
		.sort((left, right) => right.lastUsedAt - left.lastUsedAt);
}

export async function getOwnedSession(env: Env, deviceId: string, sessionId: string) {
	if (!sessionId) {
		throw new ApiError(401, 'No active session.');
	}

	const session = await env.SESSIONS.get(sessionKey(deviceId, sessionId), 'json');
	if (!isStoredSession(session)) {
		throw new ApiError(401, 'Session not found.');
	}

	return session;
}

export async function putSession(env: Env, session: StoredSession) {
	await env.SESSIONS.put(sessionKey(session.deviceId, session.sessionId), JSON.stringify(session), {
		expirationTtl: SESSION_TTL_SECONDS
	});
}

export async function getDeviceUserSessionId(deviceId: string, userId: string) {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(JSON.stringify([deviceId, userId]))
	);
	const encoded = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
	return `account-${encoded}`;
}

export async function deleteSession(env: Env, session: StoredSession) {
	await env.SESSIONS.delete(sessionKey(session.deviceId, session.sessionId));
}

export function isConfirmedInvalidSessionError(error: unknown) {
	if (!(error instanceof ApiError)) return false;
	if (error.status === 401) return true;
	return (
		error.status === 400 &&
		/invalid\s+refresh\s+token|refresh\s+token.*(?:not found|expired)/i.test(error.message)
	);
}

function getPersistedDisplayName(metadata: Record<string, unknown> | undefined) {
	const value = metadata?.display_name;
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function activateSession(headers: Headers, sessionId: string, env: Env) {
	setCookie(headers, ACTIVE_SESSION_COOKIE, sessionId, env);
}

export function clearActiveSession(headers: Headers, env: Env) {
	clearCookie(headers, ACTIVE_SESSION_COOKIE, env);
}

export function sessionKey(deviceId: string, sessionId: string) {
	return `${sessionKeyPrefix(deviceId)}${sessionId}`;
}

function sessionKeyPrefix(deviceId: string) {
	return `device:${deviceId}:session:`;
}

function moveActiveSessionFirst(sessions: StoredSession[], activeSessionId: string | null) {
	if (!activeSessionId) return sessions;
	const activeIndex = sessions.findIndex((session) => session.sessionId === activeSessionId);
	if (activeIndex <= 0) return sessions;
	return [
		sessions[activeIndex],
		...sessions.slice(0, activeIndex),
		...sessions.slice(activeIndex + 1)
	];
}

function toPublicSession(session: StoredSession, activeSessionId: string | null): PublicSession {
	return {
		sessionId: session.sessionId,
		userId: session.userId,
		email: session.email,
		username: session.username || session.email || session.userId,
		displayName: session.displayName || session.email || session.userId,
		createdAt: session.createdAt,
		lastUsedAt: session.lastUsedAt,
		active: session.sessionId === activeSessionId
	};
}

function isStoredSession(value: unknown): value is StoredSession {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const record = value as Record<string, unknown>;
	return (
		typeof record.sessionId === 'string' &&
		typeof record.deviceId === 'string' &&
		typeof record.userId === 'string' &&
		(typeof record.email === 'string' || record.email === null) &&
		(record.username === undefined ||
			typeof record.username === 'string' ||
			record.username === null) &&
		(record.displayName === undefined ||
			typeof record.displayName === 'string' ||
			record.displayName === null) &&
		typeof record.supabaseAccessToken === 'string' &&
		typeof record.supabaseRefreshToken === 'string' &&
		(typeof record.expiresAt === 'number' || record.expiresAt === null) &&
		typeof record.createdAt === 'number' &&
		typeof record.lastUsedAt === 'number'
	);
}
