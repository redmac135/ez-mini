import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest, type Env } from '../src/index.ts';
import { IdentityUnlinkCoordinator } from '../src/auth/identity-unlink-coordinator.ts';
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
	API_PUBLIC_URL: 'https://mini.api.ethanzhao.ca',
	CORS_ORIGINS: 'https://blank.ethanzhao.ca,http://localhost:1351'
} as unknown as Env;

class SerialCoordinatorState {
	private pending = Promise.resolve();

	blockConcurrencyWhile<T>(callback: () => Promise<T>) {
		const result = this.pending.then(callback, callback);
		this.pending = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}
}

test.beforeEach(() => {
	env.SESSIONS = new MemoryKv() as unknown as KVNamespace;
	env.IDENTITY_UNLINKER = createUnlinkNamespace(env);
});

test('OAuth rejects return URLs outside the configured app origins', async () => {
	let providerRequestMade = false;
	mockFetch(async () => {
		providerRequestMade = true;
		return new Response(null, { status: 302, headers: { location: 'https://github.com/' } });
	});
	const response = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://evil.example.test/')}`
		),
		env
	);

	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), { error: 'App return URL is not allowed.' });
	assert.equal(providerRequestMade, false);
});

test('OAuth sign-in startup failures return to the app with a clear error result', async () => {
	mockFetch(async () => new Response('unavailable', { status: 503 }));
	const response = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://blank.ethanzhao.ca/')}`
		),
		env
	);
	const returnUrl = new URL(response.headers.get('location') ?? '');

	assert.equal(response.status, 302);
	assert.equal(returnUrl.origin, 'https://blank.ethanzhao.ca');
	assert.equal(returnUrl.searchParams.get('oauth'), 'error');
	assert.equal(returnUrl.searchParams.get('oauth_reason'), 'provider_start_failed');
});

test('OAuth sign-in handles a missing provider authorization URL', async () => {
	mockFetch(async () => new Response(null, { status: 302 }));
	const response = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://blank.ethanzhao.ca/')}`
		),
		env
	);
	const returnUrl = new URL(response.headers.get('location') ?? '');

	assert.equal(response.status, 302);
	assert.equal(returnUrl.searchParams.get('oauth_reason'), 'provider_start_failed');
});

test('OAuth sign-in startup network failures return to the app', async () => {
	mockFetch(async () => {
		throw new Error('upstream unavailable');
	});
	const response = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://blank.ethanzhao.ca/')}`
		),
		env
	);
	const returnUrl = new URL(response.headers.get('location') ?? '');

	assert.equal(response.status, 302);
	assert.equal(returnUrl.searchParams.get('oauth'), 'error');
	assert.equal(returnUrl.searchParams.get('oauth_reason'), 'provider_start_failed');
});

test('OAuth sign-in uses a PKCE callback on the shared API and creates the shared device session', async () => {
	let callbackUrl = '';
	let verifier = '';
	mockFetch(async (request) => {
		const url = new URL(request.url);
		if (url.pathname === '/auth/v1/authorize') {
			assert.equal(url.searchParams.get('provider'), 'github');
			assert.equal(url.searchParams.get('code_challenge_method'), 's256');
			assert.match(url.searchParams.get('code_challenge') ?? '', /^[A-Za-z0-9_-]{43}$/);
			callbackUrl = url.searchParams.get('redirect_to') ?? '';
			return new Response(null, {
				status: 302,
				headers: { location: 'https://github.com/login/oauth/authorize' }
			});
		}
		assert.equal(url.pathname, '/auth/v1/token');
		assert.equal(url.search, '?grant_type=pkce');
		const body = (await request.json()) as { auth_code: string; code_verifier: string };
		assert.equal(body.auth_code, 'provider-code');
		verifier = body.code_verifier;
		return Response.json({
			access_token: 'access-user-a',
			refresh_token: 'refresh-user-a',
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: {
				id: 'user-a',
				email: 'a@example.com',
				user_metadata: { display_name: 'A' }
			}
		});
	});

	const start = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://blank.ethanzhao.ca/')}`,
			{ headers: { origin: 'https://blank.ethanzhao.ca' } }
		),
		env
	);
	assert.equal(start.status, 302);
	assert.equal(start.headers.get('location'), 'https://github.com/login/oauth/authorize');
	const deviceCookie = start.headers.get('set-cookie')?.match(/ez_mini_device_id=([^;,]+)/)?.[1];
	assert.ok(deviceCookie);
	assert.match(
		callbackUrl,
		/^https:\/\/mini\.api\.ethanzhao\.ca\/v1\/auth\/oauth\/callback\?flow=/
	);

	const flowId = new URL(callbackUrl).searchParams.get('flow');
	assert.ok(flowId);
	const callback = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/callback?flow=${flowId}&code=provider-code`,
			{
				headers: { cookie: `ez_mini_device_id=${deviceCookie}` }
			}
		),
		env
	);
	const returnUrl = new URL(callback.headers.get('location') ?? '');
	assert.equal(callback.status, 302);
	assert.equal(returnUrl.origin, 'https://blank.ethanzhao.ca');
	assert.equal(returnUrl.searchParams.get('oauth'), 'success');
	assert.equal(returnUrl.searchParams.get('oauth_reason'), 'sign-in');
	assert.match(callback.headers.get('set-cookie') ?? '', /ez_mini_active_session_id=/);
	assert.ok(verifier.length >= 43);

	const stored = (await env.SESSIONS.get(
		`device:${deviceCookie}:session:${callback.headers.get('set-cookie')?.match(/ez_mini_active_session_id=([^;,]+)/)?.[1]}`,
		'json'
	)) as {
		userId: string;
		supabaseAccessToken: string;
	};
	assert.equal(stored.userId, 'user-a');
	assert.equal(stored.supabaseAccessToken, 'access-user-a');
});

test('OAuth sign-in persists the provider default and concurrent callbacks share one session', async () => {
	const deviceId = 'concurrent-device';
	const callbackUrls: string[] = [];
	const displayNameWrites: unknown[] = [];
	mockFetch(async (request) => {
		const url = new URL(request.url);
		if (url.pathname === '/auth/v1/authorize') {
			callbackUrls.push(url.searchParams.get('redirect_to') ?? '');
			return new Response(null, {
				status: 302,
				headers: { location: 'https://github.com/login/oauth/authorize' }
			});
		}
		if (url.pathname === '/auth/v1/token') {
			return Response.json({
				access_token: 'shared-access',
				refresh_token: 'shared-refresh',
				expires_at: Math.floor(Date.now() / 1000) + 3600,
				user: {
					id: 'shared-user',
					email: 'shared@example.com',
					identities: [
						{
							identity_id: 'github-identity',
							provider: 'github',
							identity_data: { user_name: 'shared-handle' }
						}
					]
				}
			});
		}
		if (url.pathname === '/auth/v1/user' && request.method === 'PUT') {
			const body = (await request.json()) as { data: { display_name: string } };
			displayNameWrites.push(body.data.display_name);
			return Response.json({ user_metadata: { display_name: body.data.display_name } });
		}
		if (url.pathname === '/auth/v1/user') {
			return Response.json({ user_metadata: { display_name: 'shared-handle' } });
		}
		throw new Error(`Unexpected Supabase request: ${request.url}`);
	});
	const startUrl = `https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://blank.ethanzhao.ca/')}`;
	const cookies = `ez_mini_device_id=${deviceId}`;
	await Promise.all([
		handleRequest(new Request(startUrl, { headers: { cookie: cookies } }), env),
		handleRequest(new Request(startUrl, { headers: { cookie: cookies } }), env)
	]);
	const flowIds = callbackUrls.map((callbackUrl) => new URL(callbackUrl).searchParams.get('flow'));
	assert.equal(flowIds.length, 2);
	assert.ok(flowIds.every((flowId) => flowId));
	const callbacks = await Promise.all(
		flowIds.map((flowId) =>
			handleRequest(
				new Request(
					`https://mini.api.ethanzhao.ca/v1/auth/oauth/callback?flow=${flowId}&code=provider-code`,
					{ headers: { cookie: cookies } }
				),
				env
			)
		)
	);
	const sessions = await env.SESSIONS.list({ prefix: `device:${deviceId}:session:` });
	const stored = (await env.SESSIONS.get(sessions.keys[0]?.name ?? '', 'json')) as {
		displayName: string;
	};

	assert.ok(callbacks.every((response) => response.status === 302));
	assert.ok(displayNameWrites.includes('shared-handle'));
	assert.equal(sessions.keys.length, 1);
	assert.equal(stored.displayName, 'shared-handle');
});

test('OAuth callback rejects a flow started on another device', async () => {
	let callbackUrl = '';
	mockFetch(async (request) => {
		const url = new URL(request.url);
		callbackUrl = url.searchParams.get('redirect_to') ?? '';
		return new Response(null, {
			status: 302,
			headers: { location: 'https://github.com/login/oauth/authorize' }
		});
	});
	const start = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://blank.ethanzhao.ca/')}`
		),
		env
	);
	const flowId = new URL(callbackUrl).searchParams.get('flow');
	assert.ok(flowId);
	const callback = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/callback?flow=${flowId}&code=provider-code`,
			{
				headers: { cookie: 'ez_mini_device_id=another-device' }
			}
		),
		env
	);

	assert.equal(start.status, 302);
	assert.equal(
		new URL(callback.headers.get('location') ?? '').searchParams.get('oauth_reason'),
		'session_mismatch'
	);
});

test('OAuth sign-in with the current user returns an already-signed-in result without duplicating the session', async () => {
	const deviceId = 'device-a';
	const sessionId = 'session-a';
	await env.SESSIONS.put(
		sessionKey(deviceId, sessionId),
		JSON.stringify({
			sessionId,
			deviceId,
			userId: 'user-a',
			email: 'a@example.com',
			supabaseAccessToken: 'old-access',
			supabaseRefreshToken: 'old-refresh',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 123,
			lastUsedAt: 456
		})
	);
	let callbackUrl = '';
	mockFetch(async (request) => {
		const url = new URL(request.url);
		if (url.pathname === '/auth/v1/authorize') {
			callbackUrl = url.searchParams.get('redirect_to') ?? '';
			return new Response(null, {
				status: 302,
				headers: { location: 'https://github.com/login/oauth/authorize' }
			});
		}
		assert.equal(url.pathname, '/auth/v1/token');
		return Response.json({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: {
				id: 'user-a',
				email: 'a@example.com',
				user_metadata: { display_name: 'A' }
			}
		});
	});
	const cookies = `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=${sessionId}`;
	await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://blank.ethanzhao.ca/')}`,
			{ headers: { cookie: cookies } }
		),
		env
	);
	const flowId = new URL(callbackUrl).searchParams.get('flow');
	assert.ok(flowId);
	const callback = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/callback?flow=${flowId}&code=provider-code`,
			{ headers: { cookie: cookies } }
		),
		env
	);
	const redirect = new URL(callback.headers.get('location') ?? '');
	const sessions = await env.SESSIONS.list({ prefix: `device:${deviceId}:session:` });

	assert.equal(redirect.searchParams.get('oauth'), 'success');
	assert.equal(redirect.searchParams.get('oauth_reason'), 'already_signed_in');
	assert.equal(sessions.keys.length, 1);
});

test('OAuth sign-in confirms when switching to an existing inactive device session', async () => {
	const deviceId = 'device-a';
	const existingSessionId = 'session-a';
	await env.SESSIONS.put(
		sessionKey(deviceId, existingSessionId),
		JSON.stringify({
			sessionId: existingSessionId,
			deviceId,
			userId: 'user-a',
			email: 'a@example.com',
			supabaseAccessToken: 'old-access-a',
			supabaseRefreshToken: 'old-refresh-a',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 123,
			lastUsedAt: 456
		})
	);
	await env.SESSIONS.put(
		sessionKey(deviceId, 'session-b'),
		JSON.stringify({
			sessionId: 'session-b',
			deviceId,
			userId: 'user-b',
			email: 'b@example.com',
			supabaseAccessToken: 'old-access-b',
			supabaseRefreshToken: 'old-refresh-b',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 123,
			lastUsedAt: 456
		})
	);
	let callbackUrl = '';
	mockFetch(async (request) => {
		const url = new URL(request.url);
		if (url.pathname === '/auth/v1/authorize') {
			callbackUrl = url.searchParams.get('redirect_to') ?? '';
			return new Response(null, {
				status: 302,
				headers: { location: 'https://github.com/login/oauth/authorize' }
			});
		}
		assert.equal(url.pathname, '/auth/v1/token');
		return Response.json({
			access_token: 'new-access-a',
			refresh_token: 'new-refresh-a',
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: {
				id: 'user-a',
				email: 'a@example.com',
				user_metadata: { display_name: 'A' }
			}
		});
	});
	const cookies = `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-b`;
	await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/start?provider=github&return_to=${encodeURIComponent('https://blank.ethanzhao.ca/')}`,
			{ headers: { cookie: cookies } }
		),
		env
	);
	const flowId = new URL(callbackUrl).searchParams.get('flow');
	assert.ok(flowId);
	const callback = await handleRequest(
		new Request(
			`https://mini.api.ethanzhao.ca/v1/auth/oauth/callback?flow=${flowId}&code=provider-code`,
			{ headers: { cookie: cookies } }
		),
		env
	);
	const redirect = new URL(callback.headers.get('location') ?? '');
	const sessions = await env.SESSIONS.list({ prefix: `device:${deviceId}:session:` });

	assert.equal(redirect.searchParams.get('oauth'), 'success');
	assert.equal(redirect.searchParams.get('oauth_reason'), 'already_signed_in');
	assert.equal(sessions.keys.length, 2);
	assert.match(callback.headers.get('set-cookie') ?? '', new RegExp(existingSessionId));
});

test('email verification confirms when reusing an inactive device session', async () => {
	const deviceId = 'device-a';
	const sessionId = 'session-a';
	await env.SESSIONS.put(
		sessionKey(deviceId, sessionId),
		JSON.stringify({
			sessionId,
			deviceId,
			userId: 'user-a',
			email: 'a@example.com',
			supabaseAccessToken: 'old-access',
			supabaseRefreshToken: 'old-refresh',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 123,
			lastUsedAt: 456
		})
	);
	await env.SESSIONS.put(
		sessionKey(deviceId, 'session-b'),
		JSON.stringify({
			sessionId: 'session-b',
			deviceId,
			userId: 'user-b',
			email: 'b@example.com',
			supabaseAccessToken: 'old-access-b',
			supabaseRefreshToken: 'old-refresh-b',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 123,
			lastUsedAt: 456
		})
	);
	mockFetch(async (request) => {
		assert.equal(request.url, 'https://supabase.example.test/auth/v1/verify');
		return Response.json({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: {
				id: 'user-a',
				email: 'a@example.com',
				user_metadata: { display_name: 'A' }
			}
		});
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/verify', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=session-b`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ email: 'a@example.com', token: '12345678' })
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: { sessionId: string };
		sessions: Array<{ sessionId: string }>;
		alreadySignedIn: boolean;
	};
	const stored = (await env.SESSIONS.get(sessionKey(deviceId, sessionId), 'json')) as {
		supabaseAccessToken: string;
		createdAt: number;
	};

	assert.equal(response.status, 200);
	assert.equal(body.alreadySignedIn, true);
	assert.equal(body.activeSession.sessionId, sessionId);
	assert.deepEqual(
		body.sessions.map(({ sessionId }) => sessionId),
		[sessionId, 'session-b']
	);
	assert.match(response.headers.get('set-cookie') ?? '', /ez_mini_active_session_id=session-a/);
	assert.equal(stored.supabaseAccessToken, 'new-access');
	assert.equal(stored.createdAt, 123);
});

test('adding a different email account preserves the current device session', async () => {
	const deviceId = 'device-a';
	const currentSessionId = 'session-a';
	await env.SESSIONS.put(
		sessionKey(deviceId, currentSessionId),
		JSON.stringify({
			sessionId: currentSessionId,
			deviceId,
			userId: 'user-a',
			email: 'a@example.com',
			supabaseAccessToken: 'access-user-a',
			supabaseRefreshToken: 'refresh-user-a',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 123,
			lastUsedAt: 456
		})
	);
	mockFetch(async () =>
		Response.json({
			access_token: 'access-user-b',
			refresh_token: 'refresh-user-b',
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: {
				id: 'user-b',
				email: 'b@example.com',
				user_metadata: { display_name: 'B' }
			}
		})
	);
	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/verify', {
			method: 'POST',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=${currentSessionId}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ email: 'b@example.com', token: '12345678' })
		}),
		env
	);
	const body = (await response.json()) as {
		activeSession: { userId: string };
		sessions: Array<{ userId: string }>;
		alreadySignedIn?: boolean;
	};

	assert.equal(response.status, 200);
	assert.equal(body.activeSession.userId, 'user-b');
	assert.deepEqual(body.sessions.map(({ userId }) => userId).sort(), ['user-a', 'user-b']);
	assert.equal(body.alreadySignedIn, undefined);
});

test('linked identities require an active session and unlink through the authenticated Supabase user', async () => {
	const unauthorized = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/identities'),
		env
	);
	assert.equal(unauthorized.status, 401);

	const deviceId = 'device-linked';
	const activeSessionId = 'session-linked';
	await env.SESSIONS.put(
		sessionKey(deviceId, activeSessionId),
		JSON.stringify({
			sessionId: activeSessionId,
			deviceId,
			userId: 'user-a',
			email: 'a@example.com',
			supabaseAccessToken: 'access-user-a',
			supabaseRefreshToken: 'refresh-user-a',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 1,
			lastUsedAt: 1
		})
	);
	let deleteCount = 0;
	mockFetch(async (request) => {
		const url = new URL(request.url);
		assert.equal(request.headers.get('authorization'), 'Bearer access-user-a');
		if (request.method === 'DELETE') {
			deleteCount += 1;
			assert.equal(url.pathname, '/auth/v1/user/identities/github-identity');
			return Response.json({});
		}
		assert.equal(request.method, 'GET');
		assert.equal(url.pathname, '/auth/v1/user');
		return Response.json({
			identities: [
				{
					identity_id: 'email-identity',
					provider: 'email',
					identity_data: { email: 'a@example.com' },
					created_at: '2026-01-01T00:00:00Z'
				},
				...(deleteCount === 0
					? [
							{
								identity_id: 'github-identity',
								provider: 'github',
								identity_data: { user_name: 'taylor-dev' },
								created_at: '2026-01-02T00:00:00Z'
							}
						]
					: [])
			]
		});
	});

	const response = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/identities/github-identity', {
			method: 'DELETE',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=${activeSessionId}`
			}
		}),
		env
	);
	const body = (await response.json()) as {
		identities: Array<{ provider: string; email: string }>;
	};

	assert.equal(response.status, 200);
	assert.equal(deleteCount, 1);
	assert.deepEqual(body.identities, [
		{
			id: 'email-identity',
			provider: 'email',
			displayName: null,
			email: 'a@example.com',
			createdAt: '2026-01-01T00:00:00Z'
		}
	]);

	const lastIdentity = await handleRequest(
		new Request('https://mini.api.ethanzhao.ca/v1/auth/identities/email-identity', {
			method: 'DELETE',
			headers: {
				cookie: `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=${activeSessionId}`
			}
		}),
		env
	);
	assert.equal(lastIdentity.status, 409);
	assert.deepEqual(await lastIdentity.json(), {
		error: 'At least one sign-in method must remain connected.'
	});
	assert.equal(deleteCount, 1);
});

test('simultaneous unlinks serialize identity checks and preserve one sign-in method', async () => {
	const deviceId = 'concurrent-unlink-device';
	const sessionId = 'concurrent-unlink-session';
	await env.SESSIONS.put(
		sessionKey(deviceId, sessionId),
		JSON.stringify({
			sessionId,
			deviceId,
			userId: 'concurrent-unlink-user',
			email: 'person@example.com',
			supabaseAccessToken: 'unlink-access',
			supabaseRefreshToken: 'unlink-refresh',
			expiresAt: Math.floor(Date.now() / 1000) + 3600,
			createdAt: 1,
			lastUsedAt: 1
		})
	);
	let currentIdentities = [
		{ identity_id: 'email-identity', provider: 'email', identity_data: { email: 'person@example.com' } },
		{ identity_id: 'github-identity', provider: 'github', identity_data: { user_name: 'person' } }
	];
	const deletedIdentities: string[] = [];
	mockFetch(async (request) => {
		const url = new URL(request.url);
		assert.equal(request.headers.get('authorization'), 'Bearer unlink-access');
		if (request.method === 'GET') return Response.json({ identities: currentIdentities });
		assert.equal(request.method, 'DELETE');
		const identityId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
		deletedIdentities.push(identityId);
		currentIdentities = currentIdentities.filter((identity) => identity.identity_id !== identityId);
		return Response.json({});
	});
	const cookie = `ez_mini_device_id=${deviceId}; ez_mini_active_session_id=${sessionId}`;
	const responses = await Promise.all([
		'github-identity',
		'email-identity'
	].map((identityId) =>
		handleRequest(
			new Request(`https://mini.api.ethanzhao.ca/v1/auth/identities/${identityId}`, {
				method: 'DELETE',
				headers: { cookie }
			}),
			env
		)
	));
	const statuses = responses.map((response) => response.status).sort();

	assert.deepEqual(statuses, [200, 409]);
	assert.equal(deletedIdentities.length, 1);
	assert.equal(currentIdentities.length, 1);
});

function createUnlinkNamespace(env: Env) {
	const coordinators = new Map<string, IdentityUnlinkCoordinator>();
	return {
		idFromName(name: string) {
			return name;
		},
		get(id: string) {
			let coordinator = coordinators.get(id);
			if (!coordinator) {
				coordinator = new IdentityUnlinkCoordinator(
					new SerialCoordinatorState() as unknown as DurableObjectState,
					env
				);
				coordinators.set(id, coordinator);
			}
			return {
				fetch(request: Request) {
					return coordinator!.fetch(request);
				}
			};
		}
	} as unknown as DurableObjectNamespace;
}

function mockFetch(handler: (request: Request) => Promise<Response> | Response) {
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
		handler(new Request(input, init))) as typeof fetch;
}
