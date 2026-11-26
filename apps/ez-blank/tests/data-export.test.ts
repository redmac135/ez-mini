import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { exportPages } from '../src/lib/editor/core/data-export';
import { createPage } from '../src/lib/editor/core/session';

test('exports only live pages owned by the active account and excludes storage metadata', () => {
	const page = createPage('My note', { id: 'one', userId: 'user-a', now: '2026-01-01' });
	const other = createPage('Other account', { id: 'two', userId: 'user-b' });
	const deleted = {
		...createPage('Deleted', { id: 'three', userId: 'user-a' }),
		deletedAt: '2026-01-02'
	};
	const withCredentials = { ...page, secret: 'credential', token: 'private' };
	const result = exportPages([withCredentials, other, deleted], 'user-a');
	assert.deepEqual(result, {
		pages: [
			{
				id: 'one',
				title: 'My note',
				content: 'My note',
				createdAt: '2026-01-01',
				updatedAt: '2026-01-01'
			}
		]
	});
	assert.doesNotMatch(JSON.stringify(result), /credential|private|userId|syncStatus/);
});

test('includes remote pages and rejects data for a different account', () => {
	const remote = {
		id: 'remote',
		user_id: 'user-a',
		title: 'Remote',
		content: 'body',
		created_at: 'a',
		updated_at: 'b',
		deleted_at: null,
		revision: 1
	};
	assert.equal(exportPages([], 'user-a', [remote]).pages[0]?.content, 'body');
	assert.throws(() => exportPages([], 'user-b', [remote]), /Invalid account/);
	const draft = {
		...createPage('local draft', { id: 'remote', userId: 'user-a' }),
		serverRevision: 1
	};
	assert.deepEqual(
		exportPages([draft], 'user-a', [{ ...remote, revision: 2 }]).pages.map((page) => page.content),
		['body', 'local draft']
	);
});
