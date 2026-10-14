import { requireActiveSession } from '../auth/session-store.ts';
import { ApiError } from '../http/errors.ts';
import { firstRow, readJson } from '../http/json.ts';
import { supabaseRest } from '../supabase/client.ts';
import type { Env, RemoteJourneyEntry, RequestContext } from '../types.ts';

const SINCE_BUFFER_MS = 5000;
const ENTRY_COLUMNS = 'id,user_id,text,created_at,updated_at,sync_updated_at,deleted_at';
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

export type JourneyCursor = { created_at: string; id: string };
export type JourneyEntriesPage = {
	entries: RemoteJourneyEntry[];
	nextCursor: JourneyCursor | null;
};

export async function handleJourney(
	request: Request,
	env: Env,
	context: RequestContext,
	path: string
) {
	const active = await requireActiveSession(env, context);
	const url = new URL(request.url);
	if (request.method === 'GET' && path === '/journey/entries') {
		const params = new URLSearchParams({ select: ENTRY_COLUMNS });
		params.set('order', 'created_at.desc,id.desc');
		const limitValue = url.searchParams.get('limit');
		const limit = limitValue === null ? DEFAULT_PAGE_SIZE : Number(limitValue);
		if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
			throw new ApiError(400, `limit must be an integer between 1 and ${MAX_PAGE_SIZE}.`);
		}
		params.set('limit', String(limit));
		const beforeCreatedAt = url.searchParams.get('before_created_at');
		const beforeId = url.searchParams.get('before_id');
		if (Boolean(beforeCreatedAt) !== Boolean(beforeId)) {
			throw new ApiError(400, 'before_created_at and before_id must be provided together.');
		}
		if (beforeCreatedAt && beforeId) {
			if (!Number.isFinite(Date.parse(beforeCreatedAt)) || !isUuid(beforeId)) {
				throw new ApiError(400, 'Invalid Journey pagination cursor.');
			}
			params.set(
				'or',
				`(created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId}))`
			);
		}
		const since = url.searchParams.get('since');
		if (since) {
			const sinceDate = new Date(since);
			if (Number.isNaN(sinceDate.getTime())) throw new ApiError(400, 'Invalid since timestamp.');
			params.set(
				'sync_updated_at',
				`gte.${new Date(sinceDate.getTime() - SINCE_BUFFER_MS).toISOString()}`
			);
		}
		const entries = await supabaseRest<RemoteJourneyEntry[]>(env, active, `/entries?${params}`, {
			schema: 'journey'
		});
		const last = entries.at(-1);
		return {
			entries,
			nextCursor:
				entries.length === limit && last ? { created_at: last.created_at, id: last.id } : null
		} satisfies JourneyEntriesPage;
	}

	if (request.method === 'POST' && path === '/journey/entries') {
		const payload = normalizeJourneyEntryPayload(
			await readJson<unknown>(request),
			active.userId
		);
		return firstRow(
			await supabaseRest<RemoteJourneyEntry[]>(
				env,
				active,
				`/entries?select=${ENTRY_COLUMNS}&on_conflict=id`,
				{
					method: 'POST',
					schema: 'journey',
					prefer: 'resolution=merge-duplicates,return=representation',
					body: payload
				}
			)
		);
	}

	throw new ApiError(405, 'Method not allowed.');
}

export function normalizeJourneyEntryPayload(
	body: unknown,
	userId: string
): Omit<RemoteJourneyEntry, 'sync_updated_at'> {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw new ApiError(400, 'Journey entry payload must be an object.');
	}
	const payload = body as Record<string, unknown>;
	const id = typeof payload.id === 'string' ? payload.id : '';
	if (typeof payload.text !== 'string') throw new ApiError(400, 'Entry text must be a string.');
	const text = payload.text;
	const createdAt = typeof payload.created_at === 'string' ? payload.created_at : '';
	const updatedAt = typeof payload.updated_at === 'string' ? payload.updated_at : '';
	const deletedAt =
		typeof payload.deleted_at === 'string' || payload.deleted_at === null
			? payload.deleted_at
			: null;
	if (
		!isUuid(id) ||
		!createdAt ||
		!updatedAt ||
		!Number.isFinite(Date.parse(createdAt)) ||
		!Number.isFinite(Date.parse(updatedAt))
	) {
		throw new ApiError(
			400,
			'Entry id must be a UUID and created_at and updated_at must be valid timestamps.'
		);
	}
	if (text.length > 100_000)
		throw new ApiError(413, 'Entry text exceeds the 100,000 character limit.');
	if (deletedAt !== null && !Number.isFinite(Date.parse(deletedAt)))
		throw new ApiError(400, 'Invalid deleted_at timestamp.');
	return {
		id,
		user_id: userId,
		text,
		created_at: createdAt,
		updated_at: updatedAt,
		deleted_at: deletedAt
	};
}

function isUuid(value: string) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
