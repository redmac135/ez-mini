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

class SameKeyRateLimitedKv extends MemoryKv {
	private readonly writes = new Map<string, number>();
	private enforceRateLimit = false;

	enableRateLimit() {
		this.enforceRateLimit = true;
	}

	writesFor(key: string) {
		return this.writes.get(key) ?? 0;
	}

	async put(key: string, value: string) {
		const writes = this.writesFor(key);
		if (this.enforceRateLimit && writes > 0) {
			throw new Error('KV put failed: 429 Too Many Requests');
		}
		this.writes.set(key, writes + 1);
		await super.put(key, value);
	}
}

const env = {
	SESSIONS: new MemoryKv(),
	SUPABASE_URL: 'https://supabase.example.test',
	SUPABASE_PUBLISHABLE_KEY: 'publishable',
	CORS_ORIGINS: 'https://blank.ethanzhao.ca,http://localhost:1351',
	COOKIE_DOMAIN: '.ethanzhao.ca'
} as unknown as Env;

test.beforeEach(() => {
	env.SESSIONS = new MemoryKv() as unknown as KVNamespace;
});

test('OPTIONS returns CORS preflight headers without creating cookies', async () => {
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/pages', {
			method: 'OPTIONS',
			headers: { origin: 'http://localhost:1351' }
		}),
		env
	);

	assert.equal(response.status, 204);
	assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:1351');
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
			headers: { origin: 'http://localhost:1351' }
		}),
		env
	);

	assert.equal(response.status, 200);
	assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:1351');
	assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('auth broadcast frame is served without creating cookies', async () => {
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/broadcast-frame'),
		env
	);
	const body = await response.text();

	assert.equal(response.status, 200);
	assert.match(response.headers.get('content-type') ?? '', /text\/html/);
	assert.match(response.headers.get('cache-control') ?? '', /no-store/);
	assert.match(body, /ez-auth-relay/);
	assert.equal(response.headers.get('set-cookie'), null);
});

test('OTP verification does not double-write a session under a same-key KV rate limit', async () => {
	const kv = new SameKeyRateLimitedKv();
	env.SESSIONS = kv as unknown as KVNamespace;
	kv.enableRateLimit();
	mockFetch(async (request) => {
		assert.equal(request.url, 'https://supabase.example.test/auth/v1/verify');
		return Response.json({
			access_token: 'access-a',
			refresh_token: 'refresh-a',
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: {
				id: 'user-a',
				email: 'a@example.com',
				user_metadata: { display_name: 'a@example.com' }
			}
		});
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/verify', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'a@example.com', token: '12345678' })
		}),
		env
	);
	const body = (await response.json()) as { activeSession: { userId: string } };

	assert.equal(response.status, 200);
	assert.equal(body.activeSession.userId, 'user-a');
	const setCookie = response.headers.get('set-cookie') ?? '';
	const deviceId = /ez_mini_device_id=([^;]+)/.exec(setCookie)?.[1];
	const sessionId = /ez_mini_active_session_id=([^;]+)/.exec(setCookie)?.[1];
	assert.ok(deviceId);
	assert.ok(sessionId);
	assert.equal(kv.writesFor(sessionKey(deviceId, sessionId)), 1);
});

test('account switching updates last-used recency with one session write', async () => {
	const deviceId = 'switch-recency-device';
	await putStoredSession({ deviceId, sessionId: 'session-a' });
	const before = (await env.SESSIONS.get(sessionKey(deviceId, 'session-a'), 'json')) as {
		lastUsedAt: number;
	};

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
	const after = (await env.SESSIONS.get(sessionKey(deviceId, 'session-a'), 'json')) as {
		lastUsedAt: number;
	};

	assert.equal(response.status, 200);
	assert.equal(body.activeSession.sessionId, 'session-a');
	assert.ok(after.lastUsedAt > before.lastUsedAt);
});

test('repeated active session reads are read-only under a same-key KV rate limit', async () => {
	const kv = new SameKeyRateLimitedKv();
	env.SESSIONS = kv as unknown as KVNamespace;
	const deviceId = 'rate-limited-read-device';
	await putStoredSession({ deviceId, sessionId: 'session-a' });
	kv.enableRateLimit();
	const request = () =>
		handleRequest(
			new Request('https://mini.api.ethanzhao.ca/v1/auth/session', {
				headers: {
					cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`
				}
			}),
			env
		);

	const first = await request();
	const second = await request();
	assert.equal(first.status, 200);
	assert.equal(second.status, 200);
	assert.equal(((await first.json()) as { activeSession: unknown }).activeSession !== null, true);
	assert.equal(((await second.json()) as { activeSession: unknown }).activeSession !== null, true);
	assert.equal(kv.writesFor(sessionKey(deviceId, 'session-a')), 1);
});

test('session reads clear the active cookie only after a confirmed invalid refresh token', async () => {
	const deviceId = 'invalid-refresh-device';
	await putStoredSession({ deviceId, sessionId: 'session-a', expiresAt: 1 });
	mockFetch(
		async () =>
			new Response(JSON.stringify({ msg: 'Invalid Refresh Token: Refresh Token Not Found' }), {
				status: 400,
				headers: { 'content-type': 'application/json' }
			})
	);

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/session', {
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`
			}
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: null;
		sessions: Array<{ sessionId: string; active: boolean }>;
	};

	assert.equal(response.status, 200);
	assert.equal(body.activeSession, null);
	assert.deepEqual(body.sessions, [
		{
			sessionId: 'session-a',
			userId: 'user-a',
			email: 'a@example.com',
			username: 'a@example.com',
			displayName: 'a@example.com',
			createdAt: 1,
			lastUsedAt: 1,
			active: false
		}
	]);
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_active_session_id=;/);
});

test('account listing clears an active cookie after a confirmed invalid refresh token', async () => {
	const deviceId = 'invalid-account-refresh-device';
	await putStoredSession({ deviceId, sessionId: 'session-a', expiresAt: 1 });
	mockFetch(
		async () =>
			new Response(JSON.stringify({ msg: 'Invalid Refresh Token: Refresh Token Not Found' }), {
				status: 400,
				headers: { 'content-type': 'application/json' }
			})
	);

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/accounts', {
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`
			}
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: null;
		sessions: Array<{ sessionId: string; active: boolean }>;
	};

	assert.equal(response.status, 200);
	assert.equal(body.activeSession, null);
	assert.deepEqual(body.sessions, [
		{
			sessionId: 'session-a',
			userId: 'user-a',
			email: 'a@example.com',
			username: 'a@example.com',
			displayName: 'a@example.com',
			createdAt: 1,
			lastUsedAt: 1,
			active: false
		}
	]);
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_active_session_id=;/);
});

test('account listing keeps the active cookie when profile lookup is unauthorized', async () => {
	const deviceId = 'profile-unauthorized-account-device';
	await putStoredSession({ deviceId, sessionId: 'session-a' });
	mockFetch(
		async () =>
			new Response(JSON.stringify({ message: 'User not found' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			})
	);

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/accounts', {
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`
			}
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: { sessionId: string; active: boolean };
	};

	assert.equal(response.status, 200);
	assert.deepEqual(body.activeSession, { sessionId: 'session-a', active: true });
	assert.equal(response.headers.get('set-cookie'), null);
});

test('transient refresh failures return an error and keep the active cookie for retry', async () => {
	const deviceId = 'transient-refresh-device';
	await putStoredSession({ deviceId, sessionId: 'session-a', expiresAt: 1 });
	mockFetch(async () => {
		throw new Error('Supabase network unavailable.');
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/session', {
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`
			}
		}),
		env
	);

	assert.equal(response.status, 500);
	assert.deepEqual(await response.json(), { error: 'Supabase network unavailable.' });
	assert.equal(response.headers.get('set-cookie'), null);
});

test('protected routes fail closed when a transient refresh fails', async () => {
	const deviceId = 'protected-transient-refresh-device';
	await putStoredSession({ deviceId, sessionId: 'session-a', expiresAt: 1 });
	let restCalled = false;
	mockFetch(async (request) => {
		if (new URL(request.url).pathname.includes('/rest/')) restCalled = true;
		throw new Error('Supabase network unavailable.');
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/pages', {
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`
			}
		}),
		env
	);

	assert.equal(response.status, 500);
	assert.equal(restCalled, false);
});

test('session lists device accounts with usernames and active state', async () => {
	const deviceId = 'device-a';
	await putStoredSession({
		deviceId,
		sessionId: 'session-a',
		userId: 'user-a',
		email: 'a@example.com',
		username: 'account-a',
		displayName: 'Account A',
		lastUsedAt: 1
	});
	await putStoredSession({
		deviceId,
		sessionId: 'session-b',
		userId: 'user-b',
		email: 'b@example.com',
		username: 'account-b',
		displayName: 'Account B',
		lastUsedAt: 2
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/session', {
			headers: { cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a` }
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: { sessionId: string; username: string; displayName: string };
		sessions: Array<{
			sessionId: string;
			username: string;
			displayName: string;
			active: boolean;
		}>;
	};

	assert.equal(response.status, 200);
	assert.equal(body.activeSession.sessionId, 'session-a');
	assert.deepEqual(
		body.sessions.map((session) => ({
			sessionId: session.sessionId,
			username: session.username,
			displayName: session.displayName,
			active: session.active
		})),
		[
			{
				sessionId: 'session-a',
				username: 'account-a',
				displayName: 'Account A',
				active: true
			},
			{
				sessionId: 'session-b',
				username: 'account-b',
				displayName: 'Account B',
				active: false
			}
		]
	);
});

test('session startup serves legacy account names from cached data without network access', async () => {
	const deviceId = 'legacy-name-device';
	await putStoredSession({
		deviceId,
		sessionId: 'legacy',
		userId: 'legacy-user',
		username: 'legacy-provider-name'
	});
	let networkRequests = 0;
	mockFetch(async () => {
		networkRequests += 1;
		throw new Error('Session startup should use cached account data.');
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/session', {
			headers: { cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=legacy` }
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: { username: string; displayName: string };
	};

	assert.equal(body.activeSession.username, 'legacy-provider-name');
	assert.equal(body.activeSession.displayName, 'a@example.com');
	assert.equal(networkRequests, 0);
});

test('session startup uses cached inactive accounts while account listing refreshes shared names', async () => {
	const deviceId = 'cached-account-device';
	await putStoredSession({
		deviceId,
		sessionId: 'active',
		userId: 'active-user',
		expiresAt: Math.floor(Date.now() / 1000) + 3600,
		lastUsedAt: 10
	});
	await putStoredSession({
		deviceId,
		sessionId: 'inactive',
		userId: 'inactive-user',
		expiresAt: 1,
		lastUsedAt: 20
	});
	const upstreamRequests: string[] = [];
	mockFetch(async (request) => {
		const url = new URL(request.url);
		upstreamRequests.push(`${request.method} ${url.pathname}`);
		if (url.pathname.endsWith('/token')) {
			return Response.json({
				access_token: 'rotated-inactive-access',
				refresh_token: 'rotated-inactive-refresh',
				expires_at: Math.floor(Date.now() / 1000) + 3600,
				user: {
					id: 'inactive-user',
					user_metadata: { display_name: 'Shared inactive-user' }
				}
			});
		}
		if (url.pathname.endsWith('/user')) {
			const userId = request.headers.get('authorization')?.includes('rotated-inactive-access')
				? 'inactive-user'
				: 'active-user';
			return Response.json({ user_metadata: { display_name: `Shared ${userId}` } });
		}
		throw new Error(`Unexpected Supabase request: ${request.url}`);
	});
	const sessionRequest = (path: string) =>
		handleRequest(
			new Request(`https://mini.api.ethanzhao.ca/v1/auth/${path}`, {
				headers: {
					cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=active`
				}
			}),
			env
		);
	const startup = await sessionRequest('session');
	const startupBody = (await startup.json()) as {
		sessions: Array<{ sessionId: string; username: string; displayName: string }>;
	};
	const cachedInactive = (await env.SESSIONS.get(sessionKey(deviceId, 'inactive'), 'json')) as {
		supabaseRefreshToken: string;
	};
	assert.equal(startup.status, 200);
	assert.deepEqual(upstreamRequests, []);
	assert.equal(cachedInactive.supabaseRefreshToken, 'refresh-inactive');
	assert.deepEqual(
		startupBody.sessions.map(({ sessionId, username }) => ({ sessionId, username })),
		[
			{ sessionId: 'active', username: 'a@example.com' },
			{ sessionId: 'inactive', username: 'a@example.com' }
		]
	);

	const accounts = await sessionRequest('accounts');
	const accountBody = (await accounts.json()) as {
		sessions: Array<{ sessionId: string; username: string; displayName: string }>;
	};
	assert.equal(accounts.status, 200);
	assert.deepEqual(
		upstreamRequests.sort(),
		['GET /auth/v1/user', 'GET /auth/v1/user', 'POST /auth/v1/token'].sort()
	);
	assert.deepEqual(
		accountBody.sessions.map(({ sessionId, username, displayName }) => ({
			sessionId,
			username,
			displayName
		})),
		[
			{ sessionId: 'active', username: 'a@example.com', displayName: 'Shared active-user' },
			{ sessionId: 'inactive', username: 'a@example.com', displayName: 'Shared inactive-user' }
		]
	);
	const refreshedInactive = (await env.SESSIONS.get(sessionKey(deviceId, 'inactive'), 'json')) as {
		supabaseRefreshToken: string;
		displayName: string;
	};
	assert.equal(refreshedInactive.supabaseRefreshToken, 'rotated-inactive-refresh');
	assert.equal(refreshedInactive.displayName, 'Shared inactive-user');
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

test('login reports upstream Cloudflare DNS failures as a readable gateway error', async () => {
	mockFetch(async (request) => {
		assert.equal(request.url, 'https://supabase.example.test/auth/v1/otp');
		return new Response('error code: 1016', {
			status: 530,
			headers: { 'content-type': 'text/plain', 'cf-error-type': '1016' }
		});
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'a@example.com' })
		}),
		env
	);

	assert.equal(response.status, 502);
	assert.deepEqual(await response.json(), {
		error: 'Supabase request failed with Cloudflare error 1016 (HTTP 530).'
	});
});

test('verify creates a backend session and sets device plus active-session cookies', async () => {
	mockFetch(async (request) => {
		assert.equal(request.url, 'https://supabase.example.test/auth/v1/verify');
		return Response.json({
			access_token: 'access-a',
			refresh_token: 'refresh-a',
			expires_at: 2_000_000_000,
			user: {
				id: 'user-a',
				email: 'a@example.com',
				user_metadata: { display_name: 'a@example.com' }
			}
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

test('OTP verification persists the initial email display name during sign-in', async () => {
	const deviceId = 'initial-name-device';
	let persistedName: string | undefined;
	mockFetch(async (request) => {
		const url = new URL(request.url);
		if (url.pathname === '/auth/v1/verify') {
			return Response.json({
				access_token: 'initial-access',
				refresh_token: 'initial-refresh',
				expires_at: Math.floor(Date.now() / 1000) + 3600,
				user: {
					id: 'initial-user',
					email: 'initial@example.com',
					user_metadata: {},
					identities: []
				}
			});
		}
		if (url.pathname === '/auth/v1/user' && request.method === 'PUT') {
			const body = (await request.json()) as { data: { display_name: string } };
			persistedName = body.data.display_name;
			return Response.json({ user_metadata: { display_name: persistedName } });
		}
		if (url.pathname === '/auth/v1/user') {
			return Response.json({ user_metadata: { display_name: persistedName } });
		}
		throw new Error(`Unexpected Supabase request: ${request.url}`);
	});
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/verify', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ email: 'initial@example.com', token: '12345678' })
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: { username: string };
		sessions: Array<{ sessionId: string }>;
	};

	assert.equal(response.status, 200);
	assert.equal(persistedName, 'initial@example.com');
	assert.equal(body.activeSession.username, 'initial@example.com');
	assert.equal(body.sessions.length, 1);
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

test('anonymous mode clears only the active session and preserves saved accounts', async () => {
	const deviceId = 'device-local';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a', lastUsedAt: 1 });
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/anonymous', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`
			}
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: null;
		sessions: Array<{ sessionId: string; active: boolean }>;
	};

	assert.equal(response.status, 200);
	assert.equal(body.activeSession, null);
	assert.deepEqual(
		body.sessions.map(({ sessionId, active }) => ({ sessionId, active })),
		[{ sessionId: 'session-a', active: false }]
	);
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_active_session_id=;/);
	assert.notEqual(await env.SESSIONS.get(sessionKey(deviceId, 'session-a')), null);
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
		assert.equal(request.headers.get('accept-profile'), 'blank');
		assert.equal(request.headers.get('content-profile'), 'blank');
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
		assert.equal(request.headers.get('accept-profile'), 'blank');
		assert.equal(request.headers.get('content-profile'), 'blank');
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

test('settings get returns null when the blank schema has no row', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	mockFetch(async (request) => {
		assert.equal(
			request.url,
			'https://supabase.example.test/rest/v1/user_settings?select=user_id,active_page_id,created_at,updated_at&user_id=eq.user-a'
		);
		assert.equal(request.headers.get('accept-profile'), 'blank');
		return Response.json([]);
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/settings', {
			headers: { cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a` }
		}),
		env
	);

	assert.equal(response.status, 200);
	assert.equal(await response.json(), null);
});

test('repeat habit upsert uses repeat schema and active user ownership', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	mockFetch(async (request) => {
		assert.equal(
			request.url,
			'https://supabase.example.test/rest/v1/habits?select=id,user_id,title,target_count,recurrence,replaces_habit_id,archived_at,deleted_at,created_at,updated_at&on_conflict=id'
		);
		assert.equal(request.method, 'POST');
		assert.equal(request.headers.get('accept-profile'), 'repeat');
		assert.equal(request.headers.get('content-profile'), 'repeat');
		assert.deepEqual(await request.json(), {
			id: 'habit-a',
			user_id: 'user-a',
			title: 'Stretch',
			target_count: 2,
			recurrence: { type: 'days', interval: 1 },
			replaces_habit_id: null,
			archived_at: null,
			deleted_at: null,
			created_at: '2026-05-12T00:00:00.000Z',
			updated_at: '2026-05-13T00:00:00.000Z'
		});
		return Response.json([
			{
				id: 'habit-a',
				user_id: 'user-a',
				title: 'Stretch',
				target_count: 2,
				recurrence: { type: 'days', interval: 1 },
				replaces_habit_id: null,
				archived_at: null,
				deleted_at: null,
				created_at: '2026-05-12T00:00:00.000Z',
				updated_at: '2026-05-13T00:00:00.000Z'
			}
		]);
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/repeat/habits', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				id: 'habit-a',
				user_id: 'other-user',
				title: 'Stretch',
				target_count: 2,
				recurrence: { type: 'days', interval: 1 },
				created_at: '2026-05-12T00:00:00.000Z',
				updated_at: '2026-05-13T00:00:00.000Z'
			})
		}),
		env
	);

	assert.equal(response.status, 200);
	assert.equal(((await response.json()) as { user_id: string }).user_id, 'user-a');
});

test('repeat completion upsert uses composite conflict identity', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	mockFetch(async (request) => {
		assert.equal(
			request.url,
			'https://supabase.example.test/rest/v1/completions?select=user_id,habit_id,completed_on,count,created_at,updated_at&on_conflict=habit_id,completed_on'
		);
		assert.equal(request.method, 'POST');
		assert.equal(request.headers.get('accept-profile'), 'repeat');
		assert.equal(request.headers.get('content-profile'), 'repeat');
		assert.deepEqual(await request.json(), {
			user_id: 'user-a',
			habit_id: 'habit-a',
			completed_on: '2026-05-13',
			count: 0,
			created_at: '2026-05-13T00:00:00.000Z',
			updated_at: '2026-05-13T01:00:00.000Z'
		});
		return Response.json([
			{
				user_id: 'user-a',
				habit_id: 'habit-a',
				completed_on: '2026-05-13',
				count: 0,
				created_at: '2026-05-13T00:00:00.000Z',
				updated_at: '2026-05-13T01:00:00.000Z'
			}
		]);
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/repeat/completions', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				user_id: 'other-user',
				habit_id: 'habit-a',
				completed_on: '2026-05-13',
				count: 0,
				created_at: '2026-05-13T00:00:00.000Z',
				updated_at: '2026-05-13T01:00:00.000Z'
			})
		}),
		env
	);

	assert.equal(response.status, 200);
	assert.equal(((await response.json()) as { user_id: string; count: number }).user_id, 'user-a');
});

test('Journey entry list uses the journey schema and returns a stable page cursor', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	mockFetch(async (request) => {
		const url = new URL(request.url);
		assert.equal(url.pathname, '/rest/v1/entries');
		assert.equal(url.searchParams.get('limit'), '1');
		assert.equal(url.searchParams.get('sync_updated_at'), 'gte.2026-01-01T23:59:55.000Z');
		assert.equal(url.searchParams.get('updated_at'), null);
		assert.equal(request.headers.get('accept-profile'), 'journey');
		return Response.json([
			{
				id: '57b177d2-4a84-42df-873d-dbb8e45def49',
				user_id: 'user-a',
				text: 'A thought',
				created_at: '2026-01-02T00:00:00.000Z',
				updated_at: '2026-01-02T00:00:00.000Z',
				sync_updated_at: '2026-01-02T00:00:00.000Z',
				deleted_at: null
			}
		]);
	});
	const response = await handleRequest(
		new Request(
			'https://mini.api.ethanzhao.ca/v1/journey/entries?limit=1&since=2026-01-02T00%3A00%3A00.000Z',
			{
				headers: { cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a` }
			}
		),
		env
	);
	const body = (await response.json()) as {
		entries: Array<{ id: string }>;
		nextCursor: { id: string } | null;
	};
	assert.equal(response.status, 200);
	assert.equal(body.entries.length, 1);
	assert.equal(body.nextCursor?.id, body.entries[0].id);
});

test('Journey upserts reject malformed deletion markers instead of clearing tombstones', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	let remoteWasCalled = false;
	mockFetch(async () => {
		remoteWasCalled = true;
		return Response.json([]);
	});
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/journey/entries', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				id: '57b177d2-4a84-42df-873d-dbb8e45def49',
				text: 'edited entry',
				created_at: '2026-01-02T00:00:00.000Z',
				updated_at: '2026-01-02T11:00:00.000Z',
				sync_updated_at: '2026-01-02T10:00:01.000Z',
				deleted_at: { malformed: true }
			})
		}),
		env
	);

	assert.equal(response.status, 400);
	assert.equal(remoteWasCalled, false);
});

test('Journey upserts recheck the device-clock winner after a concurrent server update', async () => {
	const deviceId = 'device-a';
	await putStoredSession({ deviceId, sessionId: 'session-a', userId: 'user-a' });
	const currentEntry = (updatedAt: string, syncUpdatedAt: string) => ({
		id: '57b177d2-4a84-42df-873d-dbb8e45def49',
		user_id: 'user-a',
		text: 'remote version',
		created_at: '2026-01-02T00:00:00.000Z',
		updated_at: updatedAt,
		sync_updated_at: syncUpdatedAt,
		deleted_at: null
	});
	let readCount = 0;
	let patchCount = 0;
	mockFetch(async (request) => {
		const url = new URL(request.url);
		assert.equal(request.headers.get('accept-profile'), 'journey');
		if (request.method === 'GET') {
			readCount += 1;
			return Response.json([
				readCount === 1
					? currentEntry('2026-01-02T10:00:00.000Z', '2026-01-02T10:00:01.000Z')
					: currentEntry('2026-01-02T12:00:00.000Z', '2026-01-02T12:00:01.000Z')
			]);
		}
		assert.equal(request.headers.get('content-profile'), 'journey');
		if (request.method === 'POST') return Response.json([]);
		assert.equal(request.method, 'PATCH');
		patchCount += 1;
		assert.equal(url.searchParams.get('sync_updated_at'), 'eq.2026-01-02T10:00:01.000Z');
		return Response.json([]);
	});
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/journey/entries', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-a`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				id: '57b177d2-4a84-42df-873d-dbb8e45def49',
				text: 'stale local version',
				created_at: '2026-01-02T00:00:00.000Z',
				updated_at: '2026-01-02T11:00:00.000Z',
				sync_updated_at: '2026-01-02T10:00:01.000Z',
				deleted_at: null
			})
		}),
		env
	);
	const body = (await response.json()) as { text: string; updated_at: string };
	assert.equal(response.status, 200, JSON.stringify(body));
	assert.equal(body.text, 'remote version');
	assert.equal(body.updated_at, '2026-01-02T12:00:00.000Z');
	assert.equal(readCount, 2);
	assert.equal(patchCount, 1);
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
		username?: string;
		displayName?: string;
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
			...(options.username ? { username: options.username } : {}),
			...(options.displayName ? { displayName: options.displayName } : {}),
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
