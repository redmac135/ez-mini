import { requireActiveSession } from '../auth/session-store.ts';
import { ApiError } from '../http/errors.ts';
import { readJson } from '../http/json.ts';
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
		const body = await readJson<unknown>(request);
		const payload = normalizeJourneyEntryPayload(body, active.userId);
		const expectedCursor = readExpectedSyncCursor(body);
		return upsertJourneyEntry(env, active, payload, expectedCursor);
	}

	throw new ApiError(405, 'Method not allowed.');
}

async function upsertJourneyEntry(
	env: Env,
	active: Awaited<ReturnType<typeof requireActiveSession>>,
	payload: Omit<RemoteJourneyEntry, 'sync_updated_at'>,
	initialCursor: string | null
): Promise<RemoteJourneyEntry> {
	let cursor = initialCursor;
	for (let attempt = 0; attempt < 5; attempt += 1) {
		if (cursor === null) {
			const inserted = await supabaseRest<RemoteJourneyEntry[]>(
				env,
				active,
				`/entries?select=${ENTRY_COLUMNS}&on_conflict=id`,
				{
					method: 'POST',
					schema: 'journey',
					prefer: 'resolution=ignore-duplicates,return=representation',
					body: payload
				}
			);
			if (inserted.length) return inserted[0];
		}

		const currentRows = await supabaseRest<RemoteJourneyEntry[]>(
			env,
			active,
			`/entries?select=${ENTRY_COLUMNS}&id=eq.${encodeURIComponent(payload.id)}&limit=1`,
			{ schema: 'journey' }
		);
		const current = currentRows[0];
		if (!current) {
			cursor = null;
			continue;
		}
		if (Date.parse(payload.updated_at) <= Date.parse(current.updated_at)) return current;

		cursor = current.sync_updated_at;
		const updated = await supabaseRest<RemoteJourneyEntry[]>(
			env,
			active,
			`/entries?select=${ENTRY_COLUMNS}&id=eq.${encodeURIComponent(payload.id)}&sync_updated_at=eq.${encodeURIComponent(cursor)}`,
			{
				method: 'PATCH',
				schema: 'journey',
				prefer: 'return=representation',
				body: payload
			}
		);
		if (updated.length) return updated[0];
		cursor = null;
	}
	throw new ApiError(409, 'Journey entry changed repeatedly during sync. Please retry.');
}

function readExpectedSyncCursor(body: unknown): string | null {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
	const cursor = (body as Record<string, unknown>).sync_updated_at;
	if (cursor === undefined || cursor === null || cursor === '') return null;
	if (typeof cursor !== 'string' || !Number.isFinite(Date.parse(cursor))) {
		throw new ApiError(400, 'Invalid sync_updated_at cursor.');
	}
	return cursor;
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
	const deletedAt = payload.deleted_at;
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
	if (
		deletedAt !== null &&
		(typeof deletedAt !== 'string' || !Number.isFinite(Date.parse(deletedAt)))
	)
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
