import { ApiError } from '../http/errors.ts';
import { firstRow, readJson } from '../http/json.ts';
import { requireActiveSession } from '../auth/session-store.ts';
import { supabaseRest } from '../supabase/client.ts';
import type {
	Env,
	RemoteRepeatCompletionRow,
	RemoteRepeatHabitRow,
	RequestContext
} from '../types.ts';

const SINCE_BUFFER_MS = 5000;
const HABIT_COLUMNS =
	'id,user_id,title,target_count,recurrence,replaces_habit_id,archived_at,deleted_at,created_at,updated_at';
const COMPLETION_COLUMNS = 'user_id,habit_id,completed_on,count,created_at,updated_at';

export async function handleRepeat(
	request: Request,
	env: Env,
	context: RequestContext,
	path: string
) {
	const active = await requireActiveSession(env, context);
	const url = new URL(request.url);

	if (request.method === 'GET' && path === '/repeat/habits') {
		const params = buildListParams(url, HABIT_COLUMNS);
		params.append('order', 'created_at.asc');
		params.append('order', 'id.asc');
		return supabaseRest<RemoteRepeatHabitRow[]>(env, active, `/habits?${params}`, {
			schema: 'repeat'
		});
	}

	if (request.method === 'POST' && path === '/repeat/habits') {
		const body = await readJson<Partial<RemoteRepeatHabitRow>>(request);
		const payload = normalizeHabitPayload(body, active.userId);
		return firstRow(
			await supabaseRest<RemoteRepeatHabitRow[]>(
				env,
				active,
				`/habits?select=${HABIT_COLUMNS}&on_conflict=id`,
				{
					method: 'POST',
					schema: 'repeat',
					prefer: 'resolution=merge-duplicates,return=representation',
					body: payload
				}
			)
		);
	}

	if (request.method === 'GET' && path === '/repeat/completions') {
		const params = buildListParams(url, COMPLETION_COLUMNS);
		params.append('order', 'completed_on.asc');
		params.append('order', 'habit_id.asc');
		return supabaseRest<RemoteRepeatCompletionRow[]>(env, active, `/completions?${params}`, {
			schema: 'repeat'
		});
	}

	if (request.method === 'POST' && path === '/repeat/completions') {
		const body = await readJson<Partial<RemoteRepeatCompletionRow>>(request);
		const payload = normalizeCompletionPayload(body, active.userId);
		return firstRow(
			await supabaseRest<RemoteRepeatCompletionRow[]>(
				env,
				active,
				`/completions?select=${COMPLETION_COLUMNS}&on_conflict=habit_id,completed_on`,
				{
					method: 'POST',
					schema: 'repeat',
					prefer: 'resolution=merge-duplicates,return=representation',
					body: payload
				}
			)
		);
	}

	throw new ApiError(405, 'Method not allowed.');
}

export function normalizeHabitPayload(
	body: Partial<RemoteRepeatHabitRow>,
	userId: string
): RemoteRepeatHabitRow {
	const id = typeof body.id === 'string' ? body.id : '';
	const title = typeof body.title === 'string' ? body.title : '';
	const targetCount = typeof body.target_count === 'number' ? body.target_count : 0;
	const recurrence = body.recurrence;
	const replacesHabitId =
		typeof body.replaces_habit_id === 'string' || body.replaces_habit_id === null
			? body.replaces_habit_id
			: null;
	const archivedAt =
		typeof body.archived_at === 'string' || body.archived_at === null ? body.archived_at : null;
	const deletedAt =
		typeof body.deleted_at === 'string' || body.deleted_at === null ? body.deleted_at : null;
	const createdAt = typeof body.created_at === 'string' ? body.created_at : '';
	const updatedAt = typeof body.updated_at === 'string' ? body.updated_at : '';

	if (!id || !title.trim() || targetCount <= 0 || !createdAt || !updatedAt || !recurrence) {
		throw new ApiError(
			400,
			'Habit id, title, target_count, recurrence, and timestamps are required.'
		);
	}

	return {
		id,
		user_id: userId,
		title,
		target_count: targetCount,
		recurrence,
		replaces_habit_id: replacesHabitId,
		archived_at: archivedAt,
		deleted_at: deletedAt,
		created_at: createdAt,
		updated_at: updatedAt
	};
}

export function normalizeCompletionPayload(
	body: Partial<RemoteRepeatCompletionRow>,
	userId: string
): RemoteRepeatCompletionRow {
	const habitId = typeof body.habit_id === 'string' ? body.habit_id : '';
	const completedOn = typeof body.completed_on === 'string' ? body.completed_on : '';
	const count = typeof body.count === 'number' ? body.count : -1;
	const createdAt = typeof body.created_at === 'string' ? body.created_at : '';
	const updatedAt = typeof body.updated_at === 'string' ? body.updated_at : '';

	if (!habitId || !completedOn || count < 0 || !createdAt || !updatedAt) {
		throw new ApiError(
			400,
			'Completion habit_id, completed_on, count, and timestamps are required.'
		);
	}

	return {
		user_id: userId,
		habit_id: habitId,
		completed_on: completedOn,
		count,
		created_at: createdAt,
		updated_at: updatedAt
	};
}

function buildListParams(url: URL, columns: string) {
	const params = new URLSearchParams();
	params.set('select', columns);
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
	return params;
}
