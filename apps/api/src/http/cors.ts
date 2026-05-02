import type { Env } from '../types.ts';

export const API_PREFIX = '/v1';

export function stripApiPrefix(pathname: string) {
	return pathname.startsWith(API_PREFIX) ? pathname.slice(API_PREFIX.length) || '/' : pathname;
}

export function getCorsHeaders(request: Request, env: Env) {
	const headers = new Headers();
	const origin = request.headers.get('origin');
	const allowedOrigins = new Set(
		(env.CORS_ORIGINS ?? '')
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean)
	);
	if (origin && allowedOrigins.has(origin)) {
		headers.set('access-control-allow-origin', origin);
		headers.set('access-control-allow-credentials', 'true');
		headers.set('vary', 'Origin');
	}
	headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
	headers.set('access-control-allow-headers', 'content-type');
	return headers;
}
