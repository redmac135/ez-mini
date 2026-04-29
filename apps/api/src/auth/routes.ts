import { readJson } from '../http/json.ts';
import { ApiError } from '../http/errors.ts';
import { supabaseAuth } from '../supabase/client.ts';
import type { Env, RequestContext, StoredSession, SupabaseSessionResponse } from '../types.ts';
import {
	activateSession,
	clearActiveSession,
	deleteSession,
	getOwnedSession,
	getSessionResponse,
	listDeviceSessions,
	putSession,
	refreshStoredSession
} from './session-store.ts';

export async function login(request: Request, env: Env) {
	const body = await readJson<{ email?: unknown }>(request);
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	if (!email) {
		throw new ApiError(400, 'Email is required.');
	}

	await supabaseAuth(env, '/otp', {
		method: 'POST',
		body: {
			email,
			create_user: true
		}
	});

	return { sent: true as const };
}

export async function verifyOtp(request: Request, env: Env, context: RequestContext) {
	const body = await readJson<{ email?: unknown; token?: unknown }>(request);
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	const token = typeof body.token === 'string' ? body.token.trim() : '';
	if (!email || !token) {
		throw new ApiError(400, 'Email and token are required.');
	}

	const authSession = await supabaseAuth<SupabaseSessionResponse>(env, '/verify', {
		method: 'POST',
		body: {
			email,
			token,
			type: 'email'
		}
	});
	const now = Date.now();
	const storedSession: StoredSession = {
		sessionId: crypto.randomUUID(),
		deviceId: context.deviceId,
		userId: authSession.user.id,
		email: authSession.user.email ?? email,
		supabaseAccessToken: authSession.access_token,
		supabaseRefreshToken: authSession.refresh_token,
		expiresAt: authSession.expires_at ?? null,
		createdAt: now,
		lastUsedAt: now
	};

	await putSession(env, storedSession);
	context.activeSessionId = storedSession.sessionId;
	activateSession(context.headers, storedSession.sessionId, env);

	return getSessionResponse(env, context);
}

export async function switchSession(
	request: Request,
	env: Env,
	context: RequestContext,
	headers: Headers
) {
	const body = await readJson<{ sessionId?: unknown }>(request);
	const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
	const session = await getOwnedSession(env, context.deviceId, sessionId);
	await refreshStoredSession(env, session);
	context.activeSessionId = session.sessionId;
	activateSession(headers, session.sessionId, env);
	return getSessionResponse(env, context);
}

export async function logout(
	request: Request,
	env: Env,
	context: RequestContext,
	headers: Headers
) {
	const url = new URL(request.url);
	const logoutAll = url.searchParams.get('all') === 'true';
	const body = request.headers.get('content-type')?.includes('application/json')
		? await readJson<{ sessionId?: unknown }>(request)
		: {};
	const targetSessionId =
		typeof body.sessionId === 'string' ? body.sessionId : context.activeSessionId;
	const sessions = await listDeviceSessions(env, context.deviceId);
	const targets = logoutAll
		? sessions
		: sessions.filter((session) => session.sessionId === targetSessionId);

	for (const session of targets) {
		await signOutSupabaseSession(env, session).catch(() => undefined);
		await deleteSession(env, session);
	}

	if (logoutAll || targets.some((session) => session.sessionId === context.activeSessionId)) {
		context.activeSessionId = null;
		clearActiveSession(headers, env);
	}

	return getSessionResponse(env, context);
}

async function signOutSupabaseSession(env: Env, session: StoredSession) {
	await supabaseAuth(env, '/logout', {
		method: 'POST',
		accessToken: session.supabaseAccessToken
	});
}
