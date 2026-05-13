export interface AuthSessionSummary {
	sessionId: string;
	userId: string;
	email: string | null;
	username: string;
	createdAt: number;
	lastUsedAt: number;
	active: boolean;
}

export interface AuthSessionResponse {
	activeSession: AuthSessionSummary | null;
	sessions: AuthSessionSummary[];
}

export interface AuthClientOptions {
	apiUrl: string;
	fetch?: typeof fetch;
}

export class AuthApiError extends Error {
	readonly status: number;
	readonly body: unknown;

	constructor(status: number, message: string, body: unknown = null) {
		super(message);
		this.name = 'AuthApiError';
		this.status = status;
		this.body = body;
	}
}

export interface AuthClient {
	login(email: string): Promise<{ sent: true }>;
	verify(email: string, token: string): Promise<AuthSessionResponse>;
	getSession(): Promise<AuthSessionResponse>;
	switchSession(sessionId: string): Promise<AuthSessionResponse>;
	logout(options?: { all?: boolean; sessionId?: string }): Promise<AuthSessionResponse>;
	authFetch(input: string, init?: RequestInit): Promise<Response>;
	getBroadcastRelayUrl(): string;
}

let defaultClient: AuthClient | null = null;

export function createAuthClient(options: AuthClientOptions): AuthClient {
	const apiUrl = normalizeApiUrl(options.apiUrl);
	const fetcher = options.fetch ?? fetch;

	async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await authFetch(path, {
			...init,
			headers: {
				...(init.body ? { 'content-type': 'application/json' } : {}),
				...init.headers
			}
		});

		const body = (await response.json().catch(() => null)) as unknown;
		if (!response.ok) {
			throw createApiError(response.status, body);
		}

		return body as T;
	}

	async function authFetch(input: string, init: RequestInit = {}) {
		const url = input.startsWith('http') ? input : `${apiUrl}${input}`;
		return fetcher(url, {
			...init,
			credentials: 'include',
			headers: init.headers
		});
	}

	return {
		login(email: string) {
			return request('/auth/login', {
				method: 'POST',
				body: JSON.stringify({ email })
			});
		},
		verify(email: string, token: string) {
			return request('/auth/verify', {
				method: 'POST',
				body: JSON.stringify({ email, token })
			});
		},
		getSession() {
			return request('/auth/session');
		},
		switchSession(sessionId: string) {
			return request('/auth/switch', {
				method: 'POST',
				body: JSON.stringify({ sessionId })
			});
		},
		logout(options = {}) {
			const params = new URLSearchParams();
			if (options.all) {
				params.set('all', 'true');
			}
			const path = `/auth/logout${params.size > 0 ? `?${params}` : ''}`;
			return request(path, {
				method: 'POST',
				body: options.sessionId ? JSON.stringify({ sessionId: options.sessionId }) : undefined
			});
		},
		getBroadcastRelayUrl() {
			return `${apiUrl}/auth/broadcast-frame`;
		},
		authFetch
	};
}

export function configureAuth(options: AuthClientOptions): AuthClient {
	defaultClient = createAuthClient(options);
	return defaultClient;
}

export function login(email: string) {
	return getDefaultClient().login(email);
}

export function verify(email: string, token: string) {
	return getDefaultClient().verify(email, token);
}

export function getSession() {
	return getDefaultClient().getSession();
}

export function switchSession(sessionId: string) {
	return getDefaultClient().switchSession(sessionId);
}

export function logout(options?: { all?: boolean; sessionId?: string }) {
	return getDefaultClient().logout(options);
}

export function authFetch(input: string, init?: RequestInit) {
	return getDefaultClient().authFetch(input, init);
}

export function getBroadcastRelayUrl() {
	return getDefaultClient().getBroadcastRelayUrl();
}

export function createApiError(status: number, body: unknown = null) {
	return new AuthApiError(status, readErrorMessage(body) ?? `Request failed with ${status}`, body);
}

export function isUnauthorizedError(error: unknown) {
	if (error instanceof AuthApiError) {
		return error.status === 401;
	}

	if (!(error instanceof Error)) {
		return false;
	}

	return /no active session|session not found|request failed with 401/i.test(error.message);
}

function getDefaultClient() {
	if (!defaultClient) {
		throw new Error('Auth client is not configured. Call configureAuth({ apiUrl }) first.');
	}

	return defaultClient;
}

function normalizeApiUrl(apiUrl: string) {
	const trimmed = apiUrl.trim();
	if (!trimmed) {
		throw new Error('apiUrl is required.');
	}

	return trimmed.replace(/\/+$/, '');
}

function readErrorMessage(body: unknown) {
	if (body && typeof body === 'object' && 'error' in body) {
		const error = (body as { error?: unknown }).error;
		return typeof error === 'string' ? error : null;
	}

	if (body && typeof body === 'object' && 'message' in body) {
		const message = (body as { message?: unknown }).message;
		return typeof message === 'string' ? message : null;
	}

	return null;
}
