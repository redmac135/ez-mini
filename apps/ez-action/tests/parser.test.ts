import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskInput } from '../src/lib/action/parser';

const now = new Date(2026, 4, 14);

test('parses due, planned, and repeat tokens while cleaning the title', () => {
	const parsed = parseTaskInput('Buy milk due tomorrow do next monday every week', now);
	assert.equal(parsed.title, 'Buy milk');
	assert.equal(parsed.dueAt, '2026-05-15T00:00:00.000Z');
	assert.equal(parsed.plannedAt, '2026-05-18T00:00:00.000Z');
	assert.deepEqual(parsed.repeatRule, {
		frequency: 'weekly',
		interval: 1,
		daysOfWeek: [4]
	});
});

test('parses weekly weekdays', () => {
	const parsed = parseTaskInput('Call mom every week on Monday and Wednesday', now);
	assert.equal(parsed.title, 'Call mom');
	assert.deepEqual(parsed.repeatRule, {
		frequency: 'weekly',
		interval: 1,
		daysOfWeek: [1, 3]
	});
});
