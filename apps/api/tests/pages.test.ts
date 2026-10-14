import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/http/errors.ts';
import { normalizePagePayload } from '../src/pages/routes.ts';
import { normalizeJourneyEntryPayload } from '../src/journey/routes.ts';

test('page payload normalization keeps transferable fields and enforces ownership', () => {
	assert.deepEqual(
		normalizePagePayload(
			{
				id: 'page-a',
				user_id: 'wrong-user',
				title: 'Title',
				content: 'Body',
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-02T00:00:00.000Z',
				deleted_at: '2026-01-03T00:00:00.000Z'
			},
			'user-a'
		),
		{
			id: 'page-a',
			user_id: 'user-a',
			title: 'Title',
			content: 'Body',
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-02T00:00:00.000Z',
			deleted_at: '2026-01-03T00:00:00.000Z'
		}
	);
});

test('Journey payload normalization applies session ownership and validates the UUID', () => {
	assert.deepEqual(
		normalizeJourneyEntryPayload(
			{
				id: '57b177d2-4a84-42df-873d-dbb8e45def49',
				user_id: 'attacker',
				text: 'A thought',
				created_at: '2026-01-01T00:00:00.000Z',
				updated_at: '2026-01-02T00:00:00.000Z',
				deleted_at: null
			},
			'user-a'
		),
		{
			id: '57b177d2-4a84-42df-873d-dbb8e45def49',
			user_id: 'user-a',
			text: 'A thought',
			created_at: '2026-01-01T00:00:00.000Z',
			updated_at: '2026-01-02T00:00:00.000Z',
			deleted_at: null
		}
	);
});

test('Journey payload normalization rejects invalid IDs, timestamps, and oversized content', () => {
	const valid = {
		id: '57b177d2-4a84-42df-873d-dbb8e45def49',
		text: 'A thought',
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-02T00:00:00.000Z'
	};
	for (const payload of [
		{ ...valid, id: 'not-a-uuid' },
		{ ...valid, updated_at: 'not-a-date' },
		{ ...valid, text: 'x'.repeat(100_001) }
	]) {
		assert.throws(
			() => normalizeJourneyEntryPayload(payload, 'user-a'),
			(error: unknown) =>
				error instanceof ApiError && (error.status === 400 || error.status === 413)
		);
	}
});

test('page payload normalization rejects records without sync identity fields', () => {
	assert.throws(
		() => normalizePagePayload({ title: 'Missing timestamps' }, 'user-a'),
		(error: unknown) => error instanceof ApiError && error.status === 400
	);
});
