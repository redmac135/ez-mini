import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHabitInput } from '../src/lib/repeat/parser.ts';

test('parses simple title with defaults', () => {
	assert.deepEqual(parseHabitInput('morning stretch'), {
		title: 'morning stretch',
		targetCount: 1,
		recurrence: { type: 'days', interval: 1 }
	});
});

test('parses explicit frequency and daily schedule', () => {
	assert.deepEqual(parseHabitInput('floss twice a day'), {
		title: 'floss twice a day',
		targetCount: 2,
		recurrence: { type: 'days', interval: 1 }
	});
});

test('ignores bare numbers in title', () => {
	assert.deepEqual(parseHabitInput('read 10 pages daily'), {
		title: 'read 10 pages daily',
		targetCount: 1,
		recurrence: { type: 'days', interval: 1 }
	});
});

test('parses weekday lists', () => {
	assert.deepEqual(parseHabitInput('call mom every mon, tue, fri'), {
		title: 'call mom every mon, tue, fri',
		targetCount: 1,
		recurrence: { type: 'daysOfWeek', days: [1, 2, 5], interval: 1 }
	});
});

test('parses weekly frequency phrases', () => {
	assert.deepEqual(parseHabitInput('text family once every week'), {
		title: 'text family once every week',
		targetCount: 1,
		recurrence: { type: 'weeks', interval: 1 }
	});
	assert.deepEqual(parseHabitInput('morning stretch three times a week'), {
		title: 'morning stretch three times a week',
		targetCount: 3,
		recurrence: { type: 'weeks', interval: 1 }
	});
});
