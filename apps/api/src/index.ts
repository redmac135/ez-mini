import { getSessionResponse, getRequestContext } from './auth/session-store.ts';
import { login, logout, switchSession, verifyOtp } from './auth/routes.ts';
import { getCorsHeaders, stripApiPrefix } from './http/cors.ts';
import { ApiError } from './http/errors.ts';
import { json } from './http/json.ts';
import { handlePages } from './pages/routes.ts';
import { handleSettings } from './settings/routes.ts';
import type { Env } from './types.ts';

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
		const context = await getRequestContext(request, env, responseHeaders);
		const url = new URL(request.url);
		const path = stripApiPrefix(url.pathname);

		if (request.method === 'POST' && path === '/auth/login') {
			return json(await login(request, env), { headers: responseHeaders });
		}
		if (request.method === 'POST' && path === '/auth/verify') {
			return json(await verifyOtp(request, env, context), { headers: responseHeaders });
		}
		if (request.method === 'GET' && path === '/auth/session') {
			return json(await getSessionResponse(env, context), { headers: responseHeaders });
		}
		if (request.method === 'POST' && path === '/auth/switch') {
			return json(await switchSession(request, env, context, responseHeaders), {
				headers: responseHeaders
			});
		}
		if (request.method === 'POST' && path === '/auth/logout') {
			return json(await logout(request, env, context, responseHeaders), {
				headers: responseHeaders
			});
		}
		if (path === '/pages') {
			return json(await handlePages(request, env, context, path), { headers: responseHeaders });
		}
		if (path === '/settings') {
			return json(await handleSettings(request, env, context), { headers: responseHeaders });
		}

		return json({ error: 'Not found' }, { status: 404, headers: responseHeaders });
	} catch (error) {
		const status = error instanceof ApiError ? error.status : 500;
		const message = error instanceof Error ? error.message : 'Unexpected error';
		return json({ error: message }, { status, headers: responseHeaders });
	}
}
