import { ApiError } from '../http/errors.ts';
import { readJson } from '../http/json.ts';
import type {
	Env,
	OAuthFlow,
	RequestContext,
	StoredSession,
	SupabaseIdentity,
	SupabaseSessionResponse
} from '../types.ts';
import { supabaseAuth } from '../supabase/client.ts';
import {
	activateSession,
	getAuthUserDisplayName,
	getOwnedSession,
	listDeviceSessions,
	putSession,
	refreshStoredSession
} from './session-store.ts';

const OAUTH_FLOW_TTL_SECONDS = 10 * 60;
const OAUTH_PROVIDERS = new Set(['github', 'azure']);

export async function startOAuth(
	request: Request,
	env: Env,
	context: RequestContext,
	headers: Headers,
	intent: 'sign-in' | 'link'
) {
	const url = new URL(request.url);
	const body =
		intent === 'link' ? await readJson<{ provider?: unknown; returnTo?: unknown }>(request) : null;
	const provider =
		intent === 'link'
			? typeof body?.provider === 'string'
				? body.provider
				: ''
			: (url.searchParams.get('provider') ?? '');
	if (!OAUTH_PROVIDERS.has(provider)) throw new ApiError(400, 'Unsupported sign-in provider.');
	const returnTo = validateReturnTo(
		intent === 'link'
			? typeof body?.returnTo === 'string'
				? body.returnTo
				: null
			: url.searchParams.get('return_to'),
		env
	);
	let session: StoredSession | null = null;
	if (intent === 'link') {
		session = await getOwnedSession(env, context.deviceId, context.activeSessionId ?? '');
		session = await refreshStoredSession(env, session);
	}

	const verifier = randomBase64Url(32);
	const challenge = await createCodeChallenge(verifier);
	const flow: OAuthFlow = {
		flowId: crypto.randomUUID(),
		deviceId: context.deviceId,
		provider: provider as OAuthFlow['provider'],
		intent,
		codeVerifier: verifier,
		returnTo,
		sessionId: session?.sessionId ?? null,
		createdAt: Date.now()
	};
	await env.SESSIONS.put(oauthFlowKey(flow.flowId), JSON.stringify(flow), {
		expirationTtl: OAUTH_FLOW_TTL_SECONDS
	});

	const authUrl = new URL(
		`${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/${intent === 'link' ? 'user/identities/authorize' : 'authorize'}`
	);
	authUrl.searchParams.set('provider', flow.provider);
	authUrl.searchParams.set('redirect_to', oauthCallbackUrl(env, flow.flowId));
	authUrl.searchParams.set('code_challenge', challenge);
	authUrl.searchParams.set('code_challenge_method', 's256');
	authUrl.searchParams.set('scopes', provider === 'azure' ? 'email' : 'read:user user:email');

	let response: Response;
	try {
		response = await fetch(authUrl, {
			method: 'GET',
			redirect: 'manual',
			headers: {
				apikey: env.SUPABASE_PUBLISHABLE_KEY,
				...(session ? { authorization: `Bearer ${session.supabaseAccessToken}` } : {})
			}
		});
	} catch {
		await env.SESSIONS.delete(oauthFlowKey(flow.flowId));
		if (intent === 'sign-in') {
			return redirectWithResult(headers, returnTo, 'error', 'provider_start_failed');
		}
		throw new ApiError(502, 'Unable to start provider sign-in.');
	}
	if (response.status < 300 || response.status >= 400) {
		await env.SESSIONS.delete(oauthFlowKey(flow.flowId));
		if (intent === 'sign-in') {
			return redirectWithResult(headers, returnTo, 'error', 'provider_start_failed');
		}
		throw new ApiError(response.status >= 500 ? 502 : 400, 'Unable to start provider sign-in.');
	}
	const location = response.headers.get('location');
	if (!location) {
		await env.SESSIONS.delete(oauthFlowKey(flow.flowId));
		if (intent === 'sign-in') {
			return redirectWithResult(headers, returnTo, 'error', 'provider_start_failed');
		}
		throw new ApiError(502, 'Supabase did not return a provider authorization URL.');
	}
	if (intent === 'link') {
		return Response.json({ authorizationUrl: location }, { headers });
	}
	headers.set('location', location);
	return new Response(null, { status: 302, headers });
}

export async function completeOAuth(
	request: Request,
	env: Env,
	context: RequestContext,
	headers: Headers
) {
	const url = new URL(request.url);
	const flowId = url.searchParams.get('flow');
	if (!flowId) throw new ApiError(400, 'OAuth flow is missing.');
	const key = oauthFlowKey(flowId);
	const rawFlow = await env.SESSIONS.get(key, 'json');
	await env.SESSIONS.delete(key);
	if (!isOAuthFlow(rawFlow) || rawFlow.flowId !== flowId) {
		return redirectWithResult(headers, defaultReturnTo(env), 'error', 'expired');
	}
	if (rawFlow.deviceId !== context.deviceId) {
		return redirectWithResult(headers, rawFlow.returnTo, 'error', 'session_mismatch');
	}
	if (rawFlow.intent === 'link' && context.activeSessionId !== rawFlow.sessionId) {
		return redirectWithResult(headers, rawFlow.returnTo, 'error', 'session_changed');
	}
	const providerError = url.searchParams.get('error');
	if (providerError || !url.searchParams.get('code')) {
		return redirectWithResult(
			headers,
			rawFlow.returnTo,
			'error',
			providerError === 'access_denied' ? 'cancelled' : 'provider'
		);
	}

	try {
		const authSession = await supabaseAuth<SupabaseSessionResponse>(env, '/token?grant_type=pkce', {
			method: 'POST',
			body: { auth_code: url.searchParams.get('code'), code_verifier: rawFlow.codeVerifier }
		});
		const now = Date.now();
		let alreadySignedIn = false;
		if (rawFlow.intent === 'link') {
			const prior = await getOwnedSession(env, context.deviceId, rawFlow.sessionId ?? '');
			if (authSession.user.id !== prior.userId) {
				return redirectWithResult(headers, rawFlow.returnTo, 'error', 'account_changed');
			}
			await putSession(env, {
				...prior,
				supabaseAccessToken: authSession.access_token,
				supabaseRefreshToken: authSession.refresh_token,
				expiresAt: authSession.expires_at ?? null,
				displayName: prior.displayName,
				lastUsedAt: now
			});
		} else {
			const existingSessions = await listDeviceSessions(env, context.deviceId);
			const existing =
				existingSessions.find(
					(entry) =>
						entry.userId === authSession.user.id && entry.sessionId === context.activeSessionId
				) ?? existingSessions.find((entry) => entry.userId === authSession.user.id);
			alreadySignedIn = existing !== undefined;
			const stored: StoredSession = {
				sessionId: existing?.sessionId ?? crypto.randomUUID(),
				deviceId: context.deviceId,
				userId: authSession.user.id,
				email: authSession.user.email ?? null,
				displayName: getAuthUserDisplayName(authSession.user),
				supabaseAccessToken: authSession.access_token,
				supabaseRefreshToken: authSession.refresh_token,
				expiresAt: authSession.expires_at ?? null,
				createdAt: existing?.createdAt ?? now,
				lastUsedAt: now
			};
			await putSession(env, stored);
			activateSession(headers, stored.sessionId, env);
		}
		const reason =
			rawFlow.intent === 'sign-in' && alreadySignedIn ? 'already_signed_in' : rawFlow.intent;
		return redirectWithResult(headers, rawFlow.returnTo, 'success', reason);
	} catch (error) {
		const reason =
			error instanceof ApiError && /identity_already_exists|already linked/i.test(error.message)
				? 'identity_exists'
				: 'exchange_failed';
		return redirectWithResult(headers, rawFlow.returnTo, 'error', reason);
	}
}

export async function listOAuthIdentities(env: Env, context: RequestContext) {
	const session = await refreshStoredSession(
		env,
		await getOwnedSession(env, context.deviceId, context.activeSessionId ?? '')
	);
	const user = await supabaseAuth<{ identities?: SupabaseIdentity[] }>(env, '/user', {
		method: 'GET',
		accessToken: session.supabaseAccessToken
	});
	return { identities: (user.identities ?? []).map(toPublicIdentity) };
}

export async function unlinkOAuthIdentity(identityId: string, env: Env, context: RequestContext) {
	if (!identityId) throw new ApiError(400, 'Identity ID is required.');
	const session = await refreshStoredSession(
		env,
		await getOwnedSession(env, context.deviceId, context.activeSessionId ?? '')
	);
	const user = await supabaseAuth<{ identities?: SupabaseIdentity[] }>(env, '/user', {
		method: 'GET',
		accessToken: session.supabaseAccessToken
	});
	const identities = user.identities ?? [];
	if (!identities.some((identity) => identity.identity_id === identityId)) {
		throw new ApiError(404, 'Connected identity not found.');
	}
	if (identities.length < 2) {
		throw new ApiError(409, 'At least one sign-in method must remain connected.');
	}
	await supabaseAuth(env, `/user/identities/${encodeURIComponent(identityId)}`, {
		method: 'DELETE',
		accessToken: session.supabaseAccessToken
	});
	return listOAuthIdentities(env, context);
}

function validateReturnTo(value: string | null, env: Env) {
	if (!value) throw new ApiError(400, 'App return URL is required.');
	let returnUrl: URL;
	try {
		returnUrl = new URL(value);
	} catch {
		throw new ApiError(400, 'Invalid app return URL.');
	}
	const allowedOrigins = new Set(
		(env.CORS_ORIGINS ?? '')
			.split(',')
			.map((origin) => origin.trim())
			.filter(Boolean)
	);
	if (
		!allowedOrigins.has(returnUrl.origin) ||
		returnUrl.username !== '' ||
		returnUrl.password !== '' ||
		(returnUrl.protocol !== 'https:' &&
			returnUrl.hostname !== 'localhost' &&
			returnUrl.hostname !== '127.0.0.1')
	) {
		throw new ApiError(400, 'App return URL is not allowed.');
	}
	return returnUrl.toString();
}

function oauthCallbackUrl(env: Env, flowId: string) {
	const base = env.API_PUBLIC_URL ?? env.SUPABASE_URL;
	const callback = new URL('/v1/auth/oauth/callback', base);
	callback.searchParams.set('flow', flowId);
	return callback.toString();
}

function redirectWithResult(
	headers: Headers,
	returnTo: string,
	status: 'success' | 'error',
	reason: string
) {
	const redirect = new URL(returnTo);
	redirect.searchParams.set('oauth', status);
	redirect.searchParams.set('oauth_reason', reason);
	headers.set('location', redirect.toString());
	return new Response(null, { status: 302, headers });
}

function oauthFlowKey(flowId: string) {
	return `oauth-flow:${flowId}`;
}

function defaultReturnTo(env: Env) {
	const firstAllowedOrigin = (env.CORS_ORIGINS ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.find(Boolean);
	return firstAllowedOrigin ?? 'http://localhost:1351';
}

function randomBase64Url(length: number) {
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createCodeChallenge(verifier: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	let binary = '';
	for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toPublicIdentity(identity: SupabaseIdentity) {
	const data = identity.identity_data ?? {};
	const displayName = firstString(data, [
		'full_name',
		'name',
		'user_name',
		'preferred_username',
		'login'
	]);
	const email = firstString(data, ['email']);
	return {
		id: identity.identity_id,
		provider: identity.provider,
		displayName,
		email,
		createdAt: identity.created_at ?? null
	};
}

function firstString(data: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		const value = data[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

function isOAuthFlow(value: unknown): value is OAuthFlow {
	if (!value || typeof value !== 'object') return false;
	const flow = value as Partial<OAuthFlow>;
	return (
		typeof flow.flowId === 'string' &&
		typeof flow.deviceId === 'string' &&
		(flow.provider === 'github' || flow.provider === 'azure') &&
		(flow.intent === 'sign-in' || flow.intent === 'link') &&
		typeof flow.codeVerifier === 'string' &&
		typeof flow.returnTo === 'string' &&
		(flow.sessionId === null || typeof flow.sessionId === 'string')
	);
}
