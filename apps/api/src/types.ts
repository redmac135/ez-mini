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
	username: string;
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

export interface RemoteRepeatHabitRow {
	id: string;
	user_id: string;
	title: string;
	target_count: number;
	recurrence: unknown;
	replaces_habit_id: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface RemoteRepeatCompletionRow {
	user_id: string;
	habit_id: string;
	completed_on: string;
	count: number;
	created_at: string;
	updated_at: string;
}
