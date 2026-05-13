import { ApiError } from '../http/errors.ts';
import type { Env, StoredSession } from '../types.ts';

export async function supabaseAuth<T = unknown>(
	env: Env,
	path: string,
	options: { method: string; body?: unknown; accessToken?: string }
): Promise<T> {
	const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1${path}`, {
		method: options.method,
		headers: {
			apikey: env.SUPABASE_PUBLISHABLE_KEY,
			authorization: options.accessToken
				? `Bearer ${options.accessToken}`
				: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
			'content-type': 'application/json'
		},
		body: options.body ? JSON.stringify(options.body) : undefined
	});

	return readSupabaseResponse<T>(response);
}

export async function supabaseRest<T>(
	env: Env,
	session: StoredSession,
	path: string,
	options: { method?: string; body?: unknown; prefer?: string; schema?: string } = {}
): Promise<T> {
	const headers: Record<string, string> = {
		apikey: env.SUPABASE_PUBLISHABLE_KEY,
		authorization: `Bearer ${session.supabaseAccessToken}`,
		accept: 'application/json'
	};
	if (options.body !== undefined) {
		headers['content-type'] = 'application/json';
	}
	if (options.prefer) {
		headers.prefer = options.prefer;
	}
	if (options.schema) {
		headers['accept-profile'] = options.schema;
		if (options.body !== undefined || (options.method && options.method !== 'GET')) {
			headers['content-profile'] = options.schema;
		}
	}

	const response = await fetch(`${supabaseBaseUrl(env)}/rest/v1${path}`, {
		method: options.method ?? 'GET',
		headers,
		body: options.body !== undefined ? JSON.stringify(options.body) : undefined
	});

	return readSupabaseResponse<T>(response);
}

async function readSupabaseResponse<T>(response: Response): Promise<T> {
	const text = await response.text();
	const body = text ? (JSON.parse(text) as unknown) : null;
	if (!response.ok) {
		throw new ApiError(response.status, readSupabaseError(body) ?? 'Supabase request failed.');
	}

	return body as T;
}

function supabaseBaseUrl(env: Env) {
	return env.SUPABASE_URL.replace(/\/+$/, '');
}

function readSupabaseError(body: unknown) {
	if (!body || typeof body !== 'object') {
		return null;
	}

	for (const key of ['msg', 'message', 'error_description', 'error']) {
		const value = (body as Record<string, unknown>)[key];
		if (typeof value === 'string') {
			return value;
		}
	}

	return null;
}
