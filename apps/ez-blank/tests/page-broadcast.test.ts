import test from 'node:test';
import assert from 'node:assert/strict';
import {
	createPageBroadcastMessage,
	readPageBroadcastMessage
} from '../src/lib/editor/persistence/page-broadcast.ts';
import type { LocalPageEventType } from '../src/lib/editor/persistence/session-events.ts';

const allowedTypes = new Set<LocalPageEventType>(['page-updated', 'deleted-page']);

test('page broadcast messages are scoped to known page events and current user', () => {
	assert.deepEqual(
		readPageBroadcastMessage(
			{ type: 'page-updated', id: 'page-a', userId: 'user-a' },
			allowedTypes,
			'user-a'
		),
		{ type: 'page-updated', id: 'page-a', userId: 'user-a' }
	);

	assert.equal(
		readPageBroadcastMessage(
			{ type: 'title-updated', id: 'page-a', userId: 'user-a' },
			allowedTypes,
			'user-a'
		),
		null
	);
	assert.equal(
		readPageBroadcastMessage(
			{ type: 'page-updated', id: 'page-a', userId: 'other-user' },
			allowedTypes,
			'user-a'
		),
		null
	);
	assert.equal(readPageBroadcastMessage(null, allowedTypes, 'user-a'), null);
});

test('page broadcast message creation keeps only event identity and user scope', () => {
	assert.deepEqual(createPageBroadcastMessage({ type: 'deleted-page', id: 'page-a' }, 'user-a'), {
		type: 'deleted-page',
		id: 'page-a',
		userId: 'user-a'
	});
});
