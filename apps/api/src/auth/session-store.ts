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
	return refreshStoredSession(env, session);
}

export async function refreshStoredSession(env: Env, session: StoredSession) {
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (session.expiresAt && session.expiresAt - nowSeconds > 60) {
		session.lastUsedAt = Date.now();
		await putSession(env, session);
		return session;
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
		expiresAt: refreshed.expires_at ?? session.expiresAt,
		lastUsedAt: Date.now()
	};
	await putSession(env, nextSession);
	return nextSession;
}

export async function getSessionResponse(env: Env, context: RequestContext) {
	if (context.activeSessionId) {
		try {
			await refreshStoredSession(
				env,
				await getOwnedSession(env, context.deviceId, context.activeSessionId)
			);
		} catch {
			context.activeSessionId = null;
		}
	}

	const sessions = await listDeviceSessions(env, context.deviceId);
	return {
		activeSession:
			sessions
				.map((session) => toPublicSession(session, context.activeSessionId))
				.find((session) => session.sessionId === context.activeSessionId) ?? null,
		sessions: sessions.map((session) => toPublicSession(session, context.activeSessionId))
	};
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

export async function deleteSession(env: Env, session: StoredSession) {
	await env.SESSIONS.delete(sessionKey(session.deviceId, session.sessionId));
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

function toPublicSession(session: StoredSession, activeSessionId: string | null): PublicSession {
	return {
		sessionId: session.sessionId,
		userId: session.userId,
		email: session.email,
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
		typeof record.supabaseAccessToken === 'string' &&
		typeof record.supabaseRefreshToken === 'string' &&
		(typeof record.expiresAt === 'number' || record.expiresAt === null) &&
		typeof record.createdAt === 'number' &&
		typeof record.lastUsedAt === 'number'
	);
}
