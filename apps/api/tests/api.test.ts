import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, type Env } from '../src/index.ts';
import { sessionKey } from '../src/auth/session-store.ts';

class MemoryKv {
	private values = new Map<string, string>();

	async get(key: string, type?: 'json') {
		const value = this.values.get(key) ?? null;
		return type === 'json' && value ? JSON.parse(value) : value;
	}

	async put(key: string, value: string) {
		this.values.set(key, value);
	}

	async delete(key: string) {
		this.values.delete(key);
	}

	async list({ prefix }: { prefix?: string }) {
		return {
			keys: [...this.values.keys()]
				.filter((key) => !prefix || key.startsWith(prefix))
				.map((name) => ({ name }))
		};
	}
}

const env = {
	SESSIONS: new MemoryKv(),
	SUPABASE_URL: 'https://supabase.example.test',
	SUPABASE_PUBLISHABLE_KEY: 'publishable',
	CORS_ORIGINS: 'https://blank.ethanzhao.ca,http://localhost:5173',
	COOKIE_DOMAIN: '.ethanzhao.ca'
} as unknown as Env;

test.beforeEach(() => {
	env.SESSIONS = new MemoryKv() as unknown as KVNamespace;
});

test('OPTIONS returns CORS preflight headers without creating cookies', async () => {
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/pages', {
			method: 'OPTIONS',
			headers: { origin: 'http://localhost:5173' }
		}),
		env
	);

	assert.equal(response.status, 204);
	assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
	assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
	assert.equal(response.headers.get('set-cookie'), null);
});

test('session creates a device cookie and returns an empty session list', async () => {
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/session'),
		env
	);
	const body = (await response.json()) as { activeSession: null; sessions: unknown[] };

	assert.equal(response.status, 200);
	assert.equal(body.activeSession, null);
	assert.deepEqual(body.sessions, []);
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_device_id=/);
});

test('session includes CORS headers for allowed app origins', async () => {
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/session', {
			headers: { origin: 'http://localhost:5173' }
		}),
		env
	);

	assert.equal(response.status, 200);
	assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
	assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('session lists device accounts with usernames and active state', async () => {
	const deviceId = 'device-a';
	await putStoredSession({
		deviceId,
		sessionId: 'session-a',
		userId: 'user-a',
		email: 'a@example.com',
		lastUsedAt: 1
	});
	await putStoredSession({
		deviceId,
		sessionId: 'session-b',
		userId: 'user-b',
		email: 'b@example.com',
		lastUsedAt: 2
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/session', {
			headers: { cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a` }
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: { sessionId: string; username: string };
		sessions: Array<{ sessionId: string; username: string; active: boolean }>;
	};

	assert.equal(response.status, 200);
	assert.equal(body.activeSession.sessionId, 'session-a');
	assert.deepEqual(
		body.sessions.map((session) => ({
			sessionId: session.sessionId,
			username: session.username,
			active: session.active
		})),
		[
			{ sessionId: 'session-a', username: 'a@example.com', active: true },
			{ sessionId: 'session-b', username: 'b@example.com', active: false }
		]
	);
});

test('login normalizes email before asking Supabase to send an OTP', async () => {
	mockFetch(async (request) => {
		assert.equal(request.url, 'https://supabase.example.test/auth/v1/otp');
		assert.equal(request.method, 'POST');
		assert.equal(request.headers.get('apikey'), 'publishable');
		assert.deepEqual(await request.json(), {
			email: 'a@example.com',
			create_user: true
		});
		return Response.json({});
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: '  A@Example.COM  ' })
		}),
		env
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { sent: true });
});

test('verify creates a backend session and sets device plus active-session cookies', async () => {
	mockFetch(async (request) => {
		assert.equal(request.url, 'https://supabase.example.test/auth/v1/verify');
		return Response.json({
			access_token: 'access-a',
			refresh_token: 'refresh-a',
			expires_at: 2_000_000_000,
			user: { id: 'user-a', email: 'a@example.com' }
		});
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/verify', {
			method: 'POST',
			headers: {
				origin: 'https://blank.ethanzhao.ca',
				'content-type': 'application/json'
			},
			body: JSON.stringify({ email: 'a@example.com', token: '12345678' })
		}),
		env
	);
	const body = (await response.json()) as { activeSession: { userId: string } };

	assert.equal(response.status, 200);
	assert.equal(response.headers.get('access-control-allow-origin'), 'https://blank.ethanzhao.ca');
	assert.equal(body.activeSession.userId, 'user-a');
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_device_id=/);
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_active_session_id=/);
});

test('switch validates ownership, refreshes session, and updates active-session cookie before returning', async () => {
	const deviceId = 'device-a';
	await env.SESSIONS.put(
		`device:${deviceId}:session:session-a`,
		JSON.stringify({
			sessionId: 'session-a',
			deviceId,
			userId: 'user-a',
			email: 'a@example.com',
			supabaseAccessToken: 'old-access',
			supabaseRefreshToken: 'old-refresh',
			expiresAt: 1,
			createdAt: 1,
			lastUsedAt: 1
		})
	);

	mockFetch(async (request) => {
		assert.equal(
			request.url,
			'https://supabase.example.test/auth/v1/token?grant_type=refresh_token'
		);
		return Response.json({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_at: 2_000_000_000,
			user: { id: 'user-a', email: 'a@example.com' }
		});
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/switch', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ sessionId: 'session-a' })
		}),
		env
	);
	const body = (await response.json()) as { activeSession: { sessionId: string } };

	assert.equal(response.status, 200);
	assert.equal(body.activeSession.sessionId, 'session-a');
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_active_session_id=session-a/);
	const stored = (await env.SESSIONS.get(`device:${deviceId}:session:session-a`, 'json')) as {
		supabaseRefreshToken: string;
	};
	assert.equal(stored.supabaseRefreshToken, 'new-refresh');
});

test('logout all deletes every device session and clears the active cookie', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', lastUsedAt: 2 });
	await putStoredSession({ deviceId, sessionId: 'session-b', lastUsedAt: 1 });
	const logoutTokens: string[] = [];
	mockFetch(async (request) => {
		logoutTokens.push(request.headers.get('authorization') ?? '');
		return Response.json({});
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/logout?all=true', {
			method: 'POST',
			headers: { cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a` }
		}),
		env
	);
	const body = (await response.json()) as { activeSession: null; sessions: unknown[] };

	assert.equal(response.status, 200);
	assert.deepEqual(body.sessions, []);
	assert.equal(body.activeSession, null);
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_active_session_id=;/);
	assert.equal(await env.SESSIONS.get(sessionKey(deviceId, 'session-a')), null);
	assert.equal(await env.SESSIONS.get(sessionKey(deviceId, 'session-b')), null);
	assert.deepEqual(logoutTokens.sort(), ['Bearer access-session-a', 'Bearer access-session-b']);
});

test('logout can delete an inactive session without clearing the active cookie', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a', lastUsedAt: 2 });
	await putStoredSession({ deviceId, sessionId: 'session-b', userId: 'user-b', lastUsedAt: 1 });
	mockFetch(async () => Response.json({}));

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/logout', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ sessionId: 'session-b' })
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: { sessionId: string };
		sessions: Array<{ sessionId: string }>;
	};

	assert.equal(response.status, 200);
	assert.equal(body.activeSession.sessionId, 'session-a');
	assert.deepEqual(
		body.sessions.map((session) => session.sessionId),
		['session-a']
	);
	assert.notEqual(await env.SESSIONS.get(sessionKey(deviceId, 'session-a')), null);
	assert.equal(await env.SESSIONS.get(sessionKey(deviceId, 'session-b')), null);
});

test('pages list validates since before calling Supabase REST', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a' });
	mockFetch(async () => {
		throw new Error('Supabase should not be called for invalid since values.');
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/pages?since=not-a-date', {
			headers: { cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a` }
		}),
		env
	);

	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: 'Invalid since timestamp.' });
});

test('pages upsert scopes payloads to the active user', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	mockFetch(async (request) => {
		assert.equal(
			request.url,
			'https://supabase.example.test/rest/v1/pages?select=id,user_id,title,content,created_at,updated_at,deleted_at&on_conflict=id'
		);
		assert.equal(request.method, 'POST');
		assert.equal(
			request.headers.get('prefer'),
			'resolution=merge-duplicates,return=representation'
		);
		assert.deepEqual(await request.json(), {
			id: 'page-a',
			user_id: 'user-a',
			title: 'Title',
			content: 'Body',
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-02T00:00:00.000Z',
			deleted_at: null
		});
		return Response.json([
			{
				id: 'page-a',
				user_id: 'user-a',
				title: 'Title',
				content: 'Body',
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-02T00:00:00.000Z',
				deleted_at: null
			}
		]);
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/pages', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				id: 'page-a',
				user_id: 'malicious-user',
				title: 'Title',
				content: 'Body',
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-02T00:00:00.000Z'
			})
		}),
		env
	);
	const body = (await response.json()) as { user_id: string };

	assert.equal(response.status, 200);
	assert.equal(body.user_id, 'user-a');
});

test('page item routes are not part of the public API surface', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	mockFetch(async () => {
		throw new Error('Supabase should not be called for unsupported page item routes.');
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/pages/page-a', {
			method: 'DELETE',
			headers: { cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a` }
		}),
		env
	);

	assert.equal(response.status, 404);
	assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('settings patch accepts null active page ids and upserts by active user', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	mockFetch(async (request) => {
		assert.equal(
			request.url,
			'https://supabase.example.test/rest/v1/user_settings?select=user_id,active_page_id,created_at,updated_at&on_conflict=user_id'
		);
		assert.equal(request.method, 'POST');
		assert.deepEqual(await request.json(), { user_id: 'user-a', active_page_id: null });
		return Response.json([
			{
				user_id: 'user-a',
				active_page_id: null,
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-02T00:00:00.000Z'
			}
		]);
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/settings', {
			method: 'PATCH',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ active_page_id: null })
		}),
		env
	);

	assert.equal(response.status, 200);
	assert.equal(((await response.json()) as { active_page_id: null }).active_page_id, null);
});

test('unknown routes return a JSON 404', async () => {
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/unknown'),
		env
	);

	assert.equal(response.status, 404);
	assert.deepEqual(await response.json(), { error: 'Not found' });
});

async function putStoredSession(
	options: {
		deviceId: string;
		sessionId: string;
		userId?: string;
		email?: string;
		lastUsedAt?: number;
		expiresAt?: number | null;
	} = { deviceId: 'device-a', sessionId: 'session-a' }
) {
	const sessionId = options.sessionId;
	await env.SESSIONS.put(
		sessionKey(options.deviceId, sessionId),
		JSON.stringify({
			sessionId,
			deviceId: options.deviceId,
			userId: options.userId ?? 'user-a',
			email: options.email ?? 'a@example.com',
			supabaseAccessToken: `access-${sessionId}`,
			supabaseRefreshToken: `refresh-${sessionId}`,
			expiresAt: options.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
			createdAt: 1,
			lastUsedAt: options.lastUsedAt ?? 1
		})
	);
}

function mockFetch(handler: (request: Request) => Promise<Response> | Response) {
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		return handler(new Request(input, init));
	}) as typeof fetch;
}
