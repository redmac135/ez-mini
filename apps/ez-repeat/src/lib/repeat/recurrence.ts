import { addDays, compareDateKeys, daysBetween, getWeekday, startOfWeek } from './dates';
import type { Completion, Habit, HabitProgress } from './types';

export function isHabitVisibleOnDate(habit: Habit, dateKey: string) {
	const createdDateKey = habit.createdAt.slice(0, 10);
	if (habit.deletedAt || compareDateKeys(dateKey, createdDateKey) < 0) {
		return false;
	}

	if (habit.archivedAt && compareDateKeys(dateKey, habit.archivedAt.slice(0, 10)) >= 0) {
		return false;
	}

	if (habit.recurrence.type !== 'daysOfWeek') {
		return true;
	}

	if (!habit.recurrence.days.includes(getWeekday(dateKey))) {
		return false;
	}

	if (habit.recurrence.interval <= 1) {
		return true;
	}

	const createdWeekStart = startOfWeek(createdDateKey);
	const viewedWeekStart = startOfWeek(dateKey);
	const weeks = Math.floor(daysBetween(createdWeekStart, viewedWeekStart) / 7);
	return weeks >= 0 && weeks % habit.recurrence.interval === 0;
}

export function getCompletionWindow(habit: Habit, dateKey: string) {
	if (habit.recurrence.type === 'days') {
		return {
			startDate: addDays(dateKey, -(Math.max(1, habit.recurrence.interval) - 1)),
			endDate: dateKey
		};
	}

	if (habit.recurrence.type === 'weeks') {
		return {
			startDate: addDays(startOfWeek(dateKey), -(Math.max(1, habit.recurrence.interval) - 1) * 7),
			endDate: dateKey
		};
	}

	return {
		startDate: dateKey,
		endDate: dateKey
	};
}

export function countCompletionsForHabit(habit: Habit, completions: Completion[], dateKey: string) {
	const window = getCompletionWindow(habit, dateKey);
	return completions
		.filter(
			(completion) =>
				completion.habitId === habit.id &&
				completion.completedOn >= window.startDate &&
				completion.completedOn <= window.endDate
		)
		.reduce((sum, completion) => sum + Math.max(0, completion.count), 0);
}

export type ProgressShade = 'medium' | 'mediumHeavy' | 'heavy';

export interface ProgressFillState {
	baseProgress: number;
	baseShade: 'medium' | 'mediumHeavy';
	overlayProgress: number;
	overlayShade: 'mediumHeavy' | 'heavy' | null;
}

export function buildHabitProgress(
	habits: Habit[],
	completions: Completion[],
	dateKey: string
): HabitProgress[] {
	return habits
		.filter((habit) => isHabitVisibleOnDate(habit, dateKey))
		.map((habit) => {
			const target = Math.max(1, habit.targetCount);
			const count = countCompletionsForHabit(habit, completions, dateKey);
			const ratio = Math.min(1, count / target);
			return {
				habit,
				count,
				target,
				ratio,
				complete: ratio >= 1
			};
		});
}

export function getProgressFillState(count: number, target: number): ProgressFillState {
	const safeTarget = Math.max(1, target);
	const safeCount = Math.max(0, count);

	if (safeCount <= safeTarget) {
		return {
			baseProgress: safeCount / safeTarget,
			baseShade: 'medium',
			overlayProgress: 0,
			overlayShade: null
		};
	}

	const overCount = safeCount - safeTarget;
	if (overCount <= safeTarget) {
		return {
			baseProgress: 1,
			baseShade: 'medium',
			overlayProgress: overCount / safeTarget,
			overlayShade: 'mediumHeavy'
		};
	}

	return {
		baseProgress: 1,
		baseShade: 'mediumHeavy',
		overlayProgress: (((overCount - 1) % safeTarget) + 1) / safeTarget,
		overlayShade: 'heavy'
	};
}

export function getProgressRollover(
	previousCount: number,
	count: number,
	target: number
): 'shade' | 'full-heavy' | null {
	const safeTarget = Math.max(1, target);
	const overCount = count - safeTarget;
	if (
		count !== previousCount + 1 ||
		overCount <= safeTarget ||
		(overCount - 1) % safeTarget !== 0
	) {
		return null;
	}

	return overCount > safeTarget * 2 ? 'full-heavy' : 'shade';
}

export function formatProgressCount(count: number, target: number) {
	const safeTarget = Math.max(1, target);
	const safeCount = Math.max(0, count);
	const overCount = safeCount - safeTarget;
	return overCount > 0
		? `${safeTarget}(+${overCount})/${safeTarget}`
		: `${safeCount}/${safeTarget}`;
}

export function getCompletionScore(progress: HabitProgress[]) {
	if (progress.length === 0) {
		return 0;
	}

	return progress.reduce((sum, item) => sum + item.ratio, 0) / progress.length;
}
