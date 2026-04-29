export interface Env {
	SESSIONS: KVNamespace;
	SUPABASE_URL: string;
	SUPABASE_PUBLISHABLE_KEY: string;
	CORS_ORIGINS?: string;
	COOKIE_DOMAIN?: string;
}

export interface StoredSession {
	sessionId: string;
	deviceId: string;
	userId: string;
	email: string | null;
	supabaseAccessToken: string;
	supabaseRefreshToken: string;
	expiresAt: number | null;
	createdAt: number;
	lastUsedAt: number;
}

export interface PublicSession {
	sessionId: string;
	userId: string;
	email: string | null;
	createdAt: number;
	lastUsedAt: number;
	active: boolean;
}

export interface RequestContext {
	deviceId: string;
	activeSessionId: string | null;
	headers: Headers;
}

export interface SupabaseSessionResponse {
	access_token: string;
	refresh_token: string;
	expires_at?: number;
	user: {
		id: string;
		email?: string;
	};
}

export interface RemotePageRow {
	id: string;
	user_id: string;
	title: string;
	content: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}
