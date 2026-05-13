import test from 'node:test';
import assert from 'node:assert/strict';
import {
	appendCalendarMonthKeys,
	buildCalendarMonth,
	getCalendarDayScore,
	getInitialCalendarMonthKeys,
	prependCalendarMonthKeys
} from '../src/lib/repeat/calendar.ts';
import type { Completion, Habit } from '../src/lib/repeat/types.ts';

const habit: Habit = {
	id: 'habit-1',
	userId: 'anonymous',
	title: 'Stretch',
	targetCount: 2,
	recurrence: { type: 'days', interval: 1 },
	createdAt: '2026-05-01T00:00:00.000',
	updatedAt: '2026-05-01T00:00:00.000',
	replacesHabitId: null,
	archivedAt: null,
	deletedAt: null,
	lastSyncedAt: null
};

test('buildCalendarMonth aligns days to Sunday-start weeks', () => {
	const month = buildCalendarMonth('2026-05', [], [], '2026-05-13', '2026-05-13');

	assert.equal(month.leadingBlanks, 5);
	assert.equal(month.days.length, 31);
	assert.equal(month.days[0]?.dateKey, '2026-05-01');
	assert.equal(month.days[12]?.isToday, true);
	assert.equal(month.days[12]?.isSelected, true);
});

test('initial range is centered on today month', () => {
	const months = getInitialCalendarMonthKeys('2026-05-13');

	assert.equal(months.length, 13);
	assert.equal(months[0], '2025-11');
	assert.equal(months[6], '2026-05');
	assert.equal(months[12], '2026-11');
});

test('pagination prepends and appends six months without duplicates', () => {
	const initial = getInitialCalendarMonthKeys('2026-05-13');
	const prepended = prependCalendarMonthKeys(initial);
	const appended = appendCalendarMonthKeys(initial);

	assert.equal(prepended.length, 19);
	assert.equal(prepended[0], '2025-05');
	assert.equal(prepended[6], '2025-11');
	assert.equal(new Set(prepended).size, prepended.length);

	assert.equal(appended.length, 19);
	assert.equal(appended[12], '2026-11');
	assert.equal(appended.at(-1), '2027-05');
	assert.equal(new Set(appended).size, appended.length);
});

test('calendar scores use daily completion percentage', () => {
	const completions: Completion[] = [
		{
			userId: 'anonymous',
			habitId: habit.id,
			completedOn: '2026-05-13',
			count: 1,
			createdAt: '2026-05-13T00:00:00.000',
			updatedAt: '2026-05-13T00:00:00.000',
			lastSyncedAt: null
		}
	];

	assert.equal(getCalendarDayScore([habit], completions, '2026-05-13'), 0.5);
	assert.equal(getCalendarDayScore([habit], [], '2026-05-13'), 0);
	assert.equal(getCalendarDayScore([], [], '2026-05-13'), 0);
});

test('calendar scores respect archive date visibility', () => {
	const archived: Habit = { ...habit, archivedAt: '2026-05-13T00:00:00.000' };

	assert.equal(getCalendarDayScore([archived], [], '2026-05-12'), 0);
	assert.equal(getCalendarDayScore([archived], [], '2026-05-13'), 0);
});
