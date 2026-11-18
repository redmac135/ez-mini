import { ApiError } from '../http/errors.ts';
import { readJson } from '../http/json.ts';
import { requireActiveSession } from '../auth/session-store.ts';
import { supabaseRest } from '../supabase/client.ts';
import type { Env, RemotePageRow, RequestContext } from '../types.ts';

export async function handlePages(
	request: Request,
	env: Env,
	context: RequestContext,
	path: string
) {
	const active = await requireActiveSession(env, context);
	const url = new URL(request.url);

	if (request.method === 'GET' && path === '/pages/sync') {
		const since = url.searchParams.get('since');
		if (since !== null && !/^\d+$/.test(since)) {
			throw new ApiError(400, 'Invalid sync cursor.');
		}
		return supabaseRest(env, active, '/rpc/sync_pages', {
			method: 'POST',
			schema: 'blank',
			body: { p_since: since }
		});
	}

	if (request.method === 'POST' && path === '/pages/sync') {
		const body = await readJson<Partial<RemotePageRow> & { expected_revision?: number | null }>(
			request
		);
		if (
			body.expected_revision !== null &&
			(!Number.isSafeInteger(body.expected_revision) || body.expected_revision! < 1)
		) {
			throw new ApiError(400, 'Expected revision is required. Refresh the app and try again.');
		}
		const payload = normalizePagePayload(body, active.userId);
		return supabaseRest(env, active, '/rpc/write_page', {
			method: 'POST',
			schema: 'blank',
			body: { p_page: payload, p_expected_revision: body.expected_revision }
		});
	}

	// Old clients can discard dirty drafts on a read, before attempting a write.
	// Reject both sides of the legacy protocol rather than allowing an unsafe pull.
	if ((request.method === 'GET' || request.method === 'POST') && path === '/pages') {
		throw new ApiError(
			426,
			'Please refresh the app before syncing your pages. Your edits remain saved locally.'
		);
	}

	throw new ApiError(405, 'Method not allowed.');
}

export function normalizePagePayload(body: Partial<RemotePageRow>, userId: string): RemotePageRow {
	const id = typeof body.id === 'string' ? body.id : '';
	const title = typeof body.title === 'string' ? body.title : '';
	const content = typeof body.content === 'string' ? body.content : '';
	const createdAt = typeof body.created_at === 'string' ? body.created_at : '';
	const updatedAt = typeof body.updated_at === 'string' ? body.updated_at : '';
	const deletedAt =
		typeof body.deleted_at === 'string' || body.deleted_at === null ? body.deleted_at : null;
	if (!id || !createdAt || !updatedAt) {
		throw new ApiError(400, 'Page id, created_at, and updated_at are required.');
	}

	return {
		id,
		user_id: userId,
		title,
		content,
		created_at: createdAt,
		updated_at: updatedAt,
		deleted_at: deletedAt
	};
}
