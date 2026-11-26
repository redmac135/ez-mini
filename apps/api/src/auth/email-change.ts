import { ApiError } from '../http/errors.ts';
import { readJson } from '../http/json.ts';
import { supabaseAuth } from '../supabase/client.ts';
import type { Env, RequestContext, SupabaseSessionResponse } from '../types.ts';
import { getOwnedSession, putSession, requireActiveSession } from './session-store.ts';
import { createCodeChallenge, randomBase64Url, validateReturnTo } from './oauth.ts';

interface EmailChangeFlow {
	deviceId: string;
	sessionId: string;
	userId: string;
	email: string;
	verifier: string;
	returnTo: string;
}

const flowKey = (id: string) => `email-change:${id}`;

export async function beginEmailChange(request: Request, env: Env, context: RequestContext) {
	const body = await readJson<{ email?: unknown; returnTo?: unknown }>(request);
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	if (!email) throw new ApiError(400, 'Email is required.');
	const returnTo = validateReturnTo(typeof body.returnTo === 'string' ? body.returnTo : null, env);
	const session = await requireActiveSession(env, context);
	const current = await supabaseAuth<{ id: string; email?: string | null }>(env, '/user', {
		method: 'GET',
		accessToken: session.supabaseAccessToken
	});
	if (current.id !== session.userId) throw new ApiError(401, 'Account changed.');
	if (current.email?.toLowerCase() === email)
		throw new ApiError(400, 'This is already your email address.');
	const id = crypto.randomUUID();
	const verifier = randomBase64Url(32);
	const flow: EmailChangeFlow = {
		deviceId: context.deviceId,
		sessionId: session.sessionId,
		userId: session.userId,
		email,
		verifier,
		returnTo
	};
	await env.SESSIONS.put(flowKey(id), JSON.stringify(flow), { expirationTtl: 24 * 60 * 60 });
	const callback = new URL('/v1/auth/oauth/callback', env.API_PUBLIC_URL ?? env.SUPABASE_URL);
	callback.searchParams.set('email_flow', id);
	try {
		await supabaseAuth(env, `/user?redirect_to=${encodeURIComponent(callback.toString())}`, {
			method: 'PUT',
			accessToken: session.supabaseAccessToken,
			body: {
				email,
				code_challenge: await createCodeChallenge(verifier),
				code_challenge_method: 's256'
			}
		});
	} catch (error) {
		await env.SESSIONS.delete(flowKey(id));
		throw error;
	}
	return { sent: true as const };
}

export async function completeEmailChange(request: Request, env: Env, headers: Headers) {
	const url = new URL(request.url);
	const id = url.searchParams.get('email_flow') ?? '';
	const flow = await env.SESSIONS.get<EmailChangeFlow>(flowKey(id), 'json');
	if (
		!flow ||
		!flow.deviceId ||
		!flow.sessionId ||
		!flow.userId ||
		!flow.email ||
		!flow.verifier ||
		!flow.returnTo
	) {
		throw new ApiError(400, 'Email change link expired. Please try again.');
	}
	const destination = new URL(validateReturnTo(flow.returnTo, env));
	const code = url.searchParams.get('code');
	if (!code) {
		destination.searchParams.set(
			'email_change',
			url.searchParams.has('error') ? 'error' : 'pending'
		);
	} else {
		try {
			const original = await getOwnedSession(env, flow.deviceId, flow.sessionId);
			if (original.userId !== flow.userId) throw new Error('Account changed.');
			const verified = await supabaseAuth<SupabaseSessionResponse>(env, '/token?grant_type=pkce', {
				method: 'POST',
				body: { auth_code: code, code_verifier: flow.verifier }
			});
			if (
				verified.user.id !== original.userId ||
				verified.user.email?.toLowerCase() !== flow.email
			) {
				throw new Error('Account changed.');
			}
			const current = await getOwnedSession(env, flow.deviceId, flow.sessionId);
			if (current.userId !== flow.userId) throw new Error('Account changed.');
			await putSession(env, {
				...current,
				email: verified.user.email ?? null,
				supabaseAccessToken: verified.access_token,
				supabaseRefreshToken: verified.refresh_token,
				expiresAt: verified.expires_at ?? null
			});
			await env.SESSIONS.delete(flowKey(id));
			destination.searchParams.set('email_change', 'success');
		} catch {
			destination.searchParams.set('email_change', 'error');
		}
	}
	headers.set('location', destination.toString());
	return new Response(null, { status: 302, headers });
}
