import { ApiError } from '../http/errors.ts';
import { firstRow, readJson } from '../http/json.ts';
import { requireActiveSession } from '../auth/session-store.ts';
import { supabaseRest } from '../supabase/client.ts';
import type { Env, RemotePageRow, RequestContext } from '../types.ts';

const SINCE_BUFFER_MS = 5000;
const PAGE_COLUMNS = 'id,user_id,title,content,created_at,updated_at,deleted_at';

export async function handlePages(
	request: Request,
	env: Env,
	context: RequestContext,
	path: string
) {
	const active = await requireActiveSession(env, context);
	const url = new URL(request.url);
	const id = path.startsWith('/pages/') ? decodeURIComponent(path.slice('/pages/'.length)) : null;

	if (request.method === 'GET' && path === '/pages') {
		const params = new URLSearchParams();
		params.set('select', PAGE_COLUMNS);
		params.append('order', 'created_at.asc');
		params.append('order', 'id.asc');
		const since = url.searchParams.get('since');
		if (since) {
			const sinceDate = new Date(since);
			if (Number.isNaN(sinceDate.getTime())) {
				throw new ApiError(400, 'Invalid since timestamp.');
			}
			params.set(
				'updated_at',
				`gte.${new Date(sinceDate.getTime() - SINCE_BUFFER_MS).toISOString()}`
			);
		}

		return supabaseRest<RemotePageRow[]>(env, active, `/pages?${params}`);
	}

	if (request.method === 'POST' && path === '/pages') {
		const body = await readJson<Partial<RemotePageRow>>(request);
		const payload = normalizePagePayload(body, active.userId);
		return firstRow(
			await supabaseRest<RemotePageRow[]>(
				env,
				active,
				`/pages?select=${PAGE_COLUMNS}&on_conflict=id`,
				{
					method: 'POST',
					prefer: 'resolution=merge-duplicates,return=representation',
					body: payload
				}
			)
		);
	}

	if (request.method === 'PATCH' && id) {
		const body = await readJson<Partial<RemotePageRow>>(request);
		const payload = normalizePagePayload({ ...body, id }, active.userId);
		return firstRow(
			await supabaseRest<RemotePageRow[]>(
				env,
				active,
				`/pages?id=eq.${encodeURIComponent(id)}&select=${PAGE_COLUMNS}`,
				{
					method: 'PATCH',
					prefer: 'return=representation',
					body: payload
				}
			)
		);
	}

	if (request.method === 'DELETE' && id) {
		return firstRow(
			await supabaseRest<RemotePageRow[]>(
				env,
				active,
				`/pages?id=eq.${encodeURIComponent(id)}&select=${PAGE_COLUMNS}`,
				{
					method: 'PATCH',
					prefer: 'return=representation',
					body: { deleted_at: new Date().toISOString() }
				}
			)
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
