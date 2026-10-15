import {
	getAccountSessionsResponse,
	getSessionResponse,
	getRequestContext
} from './auth/session-store.ts';
import { authBroadcastFrame } from './auth/broadcast-frame.ts';
import { login, logout, switchSession, useAnonymous, verifyOtp } from './auth/routes.ts';
import {
	completeOAuth,
	listOAuthIdentities,
	startOAuth,
	unlinkOAuthIdentity
} from './auth/oauth.ts';
import { getProfile, updateProfile } from './auth/profile.ts';
import { getCorsHeaders, stripApiPrefix } from './http/cors.ts';
import { ApiError } from './http/errors.ts';
import { json } from './http/json.ts';
import { handlePages } from './pages/routes.ts';
import { handleJourney } from './journey/routes.ts';
import { handleRepeat } from './repeat/routes.ts';
import { handleSettings } from './settings/routes.ts';
import type { Env } from './types.ts';
export { IdentityUnlinkCoordinator } from './auth/identity-unlink-coordinator.ts';

export type { Env } from './types.ts';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return handleRequest(request, env);
	}
};

export async function handleRequest(request: Request, env: Env): Promise<Response> {
	const corsHeaders = getCorsHeaders(request, env);
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders });
	}

	const responseHeaders = new Headers(corsHeaders);
	responseHeaders.set('content-type', 'application/json');

	try {
		const url = new URL(request.url);
		const path = stripApiPrefix(url.pathname);
		if (request.method === 'GET' && path === '/auth/broadcast-frame') {
			return authBroadcastFrame(env);
		}

		const context = await getRequestContext(request, env, responseHeaders);
		if (request.method === 'GET' && path === '/auth/oauth/start') {
			return await startOAuth(request, env, context, responseHeaders, 'sign-in');
		}
		if (request.method === 'POST' && path === '/auth/oauth/link') {
			return await startOAuth(request, env, context, responseHeaders, 'link');
		}
		if (request.method === 'GET' && path === '/auth/oauth/callback') {
			return await completeOAuth(request, env, context, responseHeaders);
		}

		if (request.method === 'POST' && path === '/auth/login') {
			return json(await login(request, env), { headers: responseHeaders });
		}
		if (request.method === 'POST' && path === '/auth/verify') {
			return json(await verifyOtp(request, env, context), { headers: responseHeaders });
		}
		if (request.method === 'GET' && path === '/auth/session') {
			return json(await getSessionResponse(env, context), { headers: responseHeaders });
		}
		if (request.method === 'GET' && path === '/auth/accounts') {
			return json(await getAccountSessionsResponse(env, context), { headers: responseHeaders });
		}
		if (request.method === 'POST' && path === '/auth/switch') {
			return json(await switchSession(request, env, context, responseHeaders), {
				headers: responseHeaders
			});
		}
		if (request.method === 'POST' && path === '/auth/anonymous') {
			return json(await useAnonymous(env, context, responseHeaders), {
				headers: responseHeaders
			});
		}
		if (request.method === 'POST' && path === '/auth/logout') {
			return json(await logout(request, env, context, responseHeaders), {
				headers: responseHeaders
			});
		}
		if (request.method === 'GET' && path === '/auth/identities') {
			return json(await listOAuthIdentities(env, context), { headers: responseHeaders });
		}
		if (request.method === 'GET' && path === '/auth/profile') {
			return json(await getProfile(env, context), { headers: responseHeaders });
		}
		if (request.method === 'PUT' && path === '/auth/profile') {
			return json(await updateProfile(request, env, context), { headers: responseHeaders });
		}
		if (request.method === 'DELETE' && path.startsWith('/auth/identities/')) {
			const identityId = path.slice('/auth/identities/'.length);
			return json(await unlinkOAuthIdentity(decodeURIComponent(identityId), env, context), {
				headers: responseHeaders
			});
		}
		if (path === '/pages') {
			return json(await handlePages(request, env, context, path), { headers: responseHeaders });
		}
		if (path === '/settings') {
			return json(await handleSettings(request, env, context), { headers: responseHeaders });
		}
		if (path === '/journey/entries') {
			return json(await handleJourney(request, env, context, path), { headers: responseHeaders });
		}
		if (path === '/repeat/habits' || path === '/repeat/completions') {
			return json(await handleRepeat(request, env, context, path), { headers: responseHeaders });
		}

		return json({ error: 'Not found' }, { status: 404, headers: responseHeaders });
	} catch (error) {
		const status = error instanceof ApiError ? error.status : 500;
		const message = error instanceof Error ? error.message : 'Unexpected error';
		return json({ error: message }, { status, headers: responseHeaders });
	}
}
