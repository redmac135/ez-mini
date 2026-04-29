import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/http/errors.ts';
import { normalizePagePayload } from '../src/pages/routes.ts';

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

test('page payload normalization rejects records without sync identity fields', () => {
	assert.throws(
		() => normalizePagePayload({ title: 'Missing timestamps' }, 'user-a'),
		(error: unknown) => error instanceof ApiError && error.status === 400
	);
});
