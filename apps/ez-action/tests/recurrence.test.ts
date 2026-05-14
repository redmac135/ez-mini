import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDateKey, spawnRepeatedTask } from '../src/lib/action/recurrence';
import { createTaskRecord, makeParsedTask } from '../src/lib/action/controller';

test('advances weekly rules to the next matching weekday', () => {
	assert.equal(
		advanceDateKey('2026-05-18', { frequency: 'weekly', interval: 1, daysOfWeek: [0, 3] }),
		'2026-05-20'
	);
});

test('monthly day rules clamp to the end of shorter months', () => {
	assert.equal(
		advanceDateKey('2026-03-31', { frequency: 'monthly', dayOfMonth: 31 }),
		'2026-04-30'
	);
});

test('completion spawns a new repeated task without mutating completion state', () => {
	const task = createTaskRecord(
		makeParsedTask('Pay rent', {
			dueAt: '2026-05-01T00:00:00.000Z',
			repeatRule: { frequency: 'monthly', dayOfMonth: 1 }
		}),
		null
	);
	const completed = { ...task, completedAt: '2026-05-14T10:00:00.000Z' };
	const spawned = spawnRepeatedTask(completed, new Date(2026, 4, 14));
	assert.ok(spawned);
	assert.equal(spawned.title, 'Pay rent');
	assert.equal(spawned.completedAt, null);
	assert.equal(spawned.dueAt, '2026-06-01T00:00:00.000Z');
	assert.notEqual(spawned.id, task.id);
});
