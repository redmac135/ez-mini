import { requireActiveSession } from '../auth/session-store.ts';
import { ApiError } from '../http/errors.ts';
import { firstRow, readJson } from '../http/json.ts';
import { supabaseRest } from '../supabase/client.ts';
import type { Env, RequestContext } from '../types.ts';

const SETTINGS_COLUMNS = 'user_id,active_page_id,created_at,updated_at';

export async function handleSettings(request: Request, env: Env, context: RequestContext) {
	const active = await requireActiveSession(env, context);
	if (request.method === 'GET') {
		const rows = await supabaseRest<Record<string, unknown>[]>(
			env,
			active,
			`/user_settings?select=${SETTINGS_COLUMNS}&user_id=eq.${encodeURIComponent(active.userId)}`,
			{ schema: 'blank' }
		);
		return rows[0] ?? null;
	}

	if (request.method === 'PATCH') {
		const body = await readJson<{ active_page_id?: unknown }>(request);
		const activePageId =
			typeof body.active_page_id === 'string' || body.active_page_id === null
				? body.active_page_id
				: undefined;
		if (activePageId === undefined) {
			throw new ApiError(400, 'active_page_id is required.');
		}

		return firstRow(
			await supabaseRest<Record<string, unknown>[]>(
				env,
				active,
				`/user_settings?select=${SETTINGS_COLUMNS}&on_conflict=user_id`,
				{
					method: 'POST',
					schema: 'blank',
					prefer: 'resolution=merge-duplicates,return=representation',
					body: { user_id: active.userId, active_page_id: activePageId }
				}
			)
		);
	}

	throw new ApiError(405, 'Method not allowed.');
}
