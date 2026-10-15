import { ApiError } from '../http/errors.ts';
import { supabaseAuth } from '../supabase/client.ts';
import type {
	Env,
	RequestContext,
	SupabaseSessionResponse,
	SupabaseUserProfile
} from '../types.ts';
import { listDeviceSessions, putSession, requireActiveSession } from './session-store.ts';

const DISPLAY_NAME_MAX_LENGTH = 80;

export async function getProfile(env: Env, context: RequestContext) {
	const session = await requireActiveSession(env, context);
	const user = await supabaseAuth<SupabaseUserProfile>(env, '/user', {
		method: 'GET',
		accessToken: session.supabaseAccessToken
	});
	let customDisplayName = readCustomDisplayName(user.user_metadata);
	let displayName = customDisplayName ?? getDefaultDisplayName(user);
	if (!customDisplayName) {
		displayName = await persistInitialDisplayName(env, session.supabaseAccessToken, user);
		customDisplayName = displayName;
	}
	await cacheDisplayName(env, context.deviceId, user.id, displayName);
	return {
		displayName,
		customDisplayName
	};
}

export async function persistInitialDisplayName(
	env: Env,
	accessToken: string,
	user: SupabaseSessionResponse['user']
) {
	const existing = readCustomDisplayName(user.user_metadata);
	if (existing) return existing;
	const displayName = getDefaultDisplayName(user);
	const updatedUser = await supabaseAuth<SupabaseUserProfile>(env, '/user', {
		method: 'PUT',
		accessToken,
		body: { data: { display_name: displayName } }
	});
	return readCustomDisplayName(updatedUser.user_metadata) ?? displayName;
}

export async function updateProfile(request: Request, env: Env, context: RequestContext) {
	const session = await requireActiveSession(env, context);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ApiError(400, 'A display name is required.');
	}
	const rawDisplayName =
		body && typeof body === 'object' ? (body as Record<string, unknown>).displayName : null;
	if (typeof rawDisplayName !== 'string') {
		throw new ApiError(400, 'A display name is required.');
	}
	const displayName = rawDisplayName.trim();
	if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
		throw new ApiError(400, `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`);
	}

	const user = await supabaseAuth<SupabaseUserProfile>(env, '/user', {
		method: 'PUT',
		accessToken: session.supabaseAccessToken,
		body: { data: { display_name: displayName || null } }
	});
	const customDisplayName = readCustomDisplayName(user.user_metadata);
	const resolvedDisplayName = customDisplayName ?? getDefaultDisplayName(user);
	await cacheDisplayName(env, context.deviceId, user.id, resolvedDisplayName);
	return {
		displayName: resolvedDisplayName,
		customDisplayName
	};
}

async function cacheDisplayName(env: Env, deviceId: string, userId: string, displayName: string) {
	const sessions = await listDeviceSessions(env, deviceId);
	await Promise.all(
		sessions
			.filter((session) => session.userId === userId)
			.map((session) => putSession(env, { ...session, displayName }))
	);
}

function readCustomDisplayName(metadata: Record<string, unknown> | undefined) {
	const value = metadata?.display_name;
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getDefaultDisplayName(user: SupabaseUserProfile) {
	for (const identity of user.identities ?? []) {
		const data = identity.identity_data ?? {};
		for (const key of ['user_name', 'preferred_username', 'login', 'full_name', 'name']) {
			const value = data[key];
			if (typeof value === 'string' && value.trim()) return value.trim();
		}
	}
	return user.email?.trim() || user.id;
}
