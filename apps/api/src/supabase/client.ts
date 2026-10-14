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
	let body: unknown = null;
	if (text) {
		try {
			body = JSON.parse(text) as unknown;
		} catch {
			if (response.ok) {
				throw new ApiError(502, `Supabase returned an invalid response (HTTP ${response.status}).`);
			}
		}
	}

	if (!response.ok) {
		const message = readSupabaseError(body) ?? readSupabaseTextError(text, response);
		const status = response.status >= 500 ? 502 : response.status;
		throw new ApiError(status, message);
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

function readSupabaseTextError(text: string, response: Response) {
	const cloudflareCode = response.headers.get('cf-error-type')?.match(/\b\d{4}\b/)?.[0];
	if (cloudflareCode) {
		return `Supabase request failed with Cloudflare error ${cloudflareCode} (HTTP ${response.status}).`;
	}

	const plainText = text
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!plainText) {
		return `Supabase request failed (HTTP ${response.status}).`;
	}

	return `Supabase request failed (HTTP ${response.status}): ${plainText.slice(0, 200)}`;
}
