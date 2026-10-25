<script lang="ts">
	import { afterUpdate, onDestroy } from 'svelte';
	import { Button, Icon } from '@ez/ui';
	import {
		formatProgressCount,
		getProgressFillState,
		getProgressRollover,
		type ProgressShade
	} from '$lib/repeat/recurrence';
	import type { HabitProgress } from '$lib/repeat/types';

	export let progress: HabitProgress;
	export let editMode = false;
	export let onComplete: (progress: HabitProgress) => void = () => {};
	export let onUndo: (progress: HabitProgress) => void = () => {};
	export let onEdit: (progress: HabitProgress) => void = () => {};
	export let onArchive: (progress: HabitProgress) => void = () => {};
	export let onDelete: (progress: HabitProgress) => void = () => {};

	let touchStart: { x: number; y: number } | null = null;
	let rolloverAnimation: 'shade-reset' | 'full-h-reset' | '' = '';
	let rolloverTimer: ReturnType<typeof setTimeout> | null = null;
	let previousProgress = {
		habitId: progress.habit.id,
		count: progress.count,
		target: progress.target
	};
	const SWIPE_MIN_X = 56;
	const SWIPE_MAX_Y = 42;
	const SHADE_COLORS: Record<ProgressShade, string> = {
		medium: 'var(--progress-medium)',
		mediumHeavy: 'var(--progress-medium-heavy)',
		heavy: 'var(--progress-heavy)'
	};

	$: fillState = getProgressFillState(progress.count, progress.target);
	$: progressLabel = formatProgressCount(progress.count, progress.target);
	$: accessibleProgressLabel =
		progress.count > progress.target
			? `${progress.count} completed, ${progress.count - progress.target} over goal of ${progress.target}`
			: `${progress.count} of ${progress.target}`;

	afterUpdate(() => {
		const changed =
			progress.habit.id !== previousProgress.habitId ||
			progress.count !== previousProgress.count ||
			progress.target !== previousProgress.target;
		if (!changed) {
			return;
		}

		const previous = previousProgress;
		previousProgress = {
			habitId: progress.habit.id,
			count: progress.count,
			target: progress.target
		};

		if (progress.habit.id !== previous.habitId || progress.target !== previous.target) {
			rolloverAnimation = '';
			return;
		}

		const rollover = getProgressRollover(previous.count, progress.count, progress.target);
		rolloverAnimation =
			rollover === 'full-heavy' ? 'full-h-reset' : rollover === 'shade' ? 'shade-reset' : '';
		if (rolloverAnimation) {
			if (rolloverTimer) clearTimeout(rolloverTimer);
			rolloverTimer = setTimeout(() => (rolloverAnimation = ''), 220);
		}
	});

	onDestroy(() => {
		if (rolloverTimer) clearTimeout(rolloverTimer);
	});

	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
		onUndo(progress);
	}

	function handleTouchStart(event: TouchEvent) {
		const touch = event.touches[0];
		if (!touch) {
			return;
		}
		touchStart = { x: touch.clientX, y: touch.clientY };
	}

	function handleTouchEnd(event: TouchEvent) {
		const touch = event.changedTouches[0];
		if (!touchStart || !touch) {
			return;
		}

		const deltaX = touch.clientX - touchStart.x;
		const deltaY = Math.abs(touch.clientY - touchStart.y);
		touchStart = null;

		if (Math.abs(deltaX) < SWIPE_MIN_X || deltaY > SWIPE_MAX_Y) {
			return;
		}

		if (deltaX > 0) {
			onComplete(progress);
			return;
		}

		onUndo(progress);
	}
</script>

<div class:editing={editMode} class="habit-shell">
	<button
		class:complete={progress.complete}
		class:shade-reset={rolloverAnimation === 'shade-reset'}
		class:full-h-reset={rolloverAnimation === 'full-h-reset'}
		class="habit-row"
		type="button"
		style={`--progress-width: ${fillState.baseProgress * 100}%; --progress-color: ${SHADE_COLORS[fillState.baseShade]}; --over-progress-width: ${fillState.overlayProgress * 100}%; --over-progress-color: ${fillState.overlayShade ? SHADE_COLORS[fillState.overlayShade] : 'transparent'}`}
		aria-label={`${progress.habit.title}, ${accessibleProgressLabel}`}
		onclick={() => onComplete(progress)}
		oncontextmenu={handleContextMenu}
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
		<span class="fill" aria-hidden="true"></span>
		<span class="over-fill" aria-hidden="true"></span>
		<span class="title">{progress.habit.title}</span>
		<span class="status">{progressLabel}</span>
	</button>

	{#if editMode}
		<div class="row-actions">
			<Button
				size="icon"
				ariaLabel={`Edit ${progress.habit.title}`}
				onclick={() => onEdit(progress)}
			>
				<Icon name="edit" />
			</Button>
			<Button
				size="icon"
				ariaLabel={`Archive ${progress.habit.title}`}
				onclick={() => onArchive(progress)}
			>
				<Icon name="archive-box" />
			</Button>
			<Button
				size="icon"
				ariaLabel={`Delete ${progress.habit.title}`}
				onclick={() => onDelete(progress)}
			>
				<Icon name="delete" />
			</Button>
		</div>
	{/if}
</div>

<style>
	.habit-shell {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 0;
		gap: 0;
		align-items: center;
		transition:
			grid-template-columns var(--duration-normal) var(--ease-standard),
			gap var(--duration-normal) var(--ease-standard);
	}

	.habit-shell.editing {
		grid-template-columns: minmax(0, 1fr) 6rem;
		gap: var(--space-2);
	}

	.habit-row {
		--progress-medium: color-mix(in srgb, var(--color-fg) 6%, var(--color-panel));
		--progress-medium-heavy: color-mix(in srgb, var(--color-fg) 28%, var(--color-panel));
		--progress-heavy: color-mix(in srgb, var(--color-fg) 47%, var(--color-panel));

		position: relative;
		overflow: hidden;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-3);
		min-height: 3.25rem;
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-panel);
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: var(--space-3) var(--space-4);
		text-align: left;
		touch-action: pan-y;
		transition: var(--theme-transition);
	}

	.habit-row:hover {
		border-color: color-mix(in srgb, var(--color-fg), transparent 78%);
	}

	.fill,
	.over-fill {
		position: absolute;
		inset: 0 auto 0 0;
		pointer-events: none;
	}

	.fill {
		width: var(--progress-width);
		background-color: var(--progress-color);
		transition:
			width var(--duration-normal) var(--ease-standard),
			background-color var(--duration-normal) var(--ease-standard);
	}

	.over-fill {
		width: var(--over-progress-width);
		background-color: var(--over-progress-color);
		transition: width var(--duration-normal) var(--ease-standard);
	}

	.shade-reset .fill,
	.shade-reset .over-fill,
	.full-h-reset .fill,
	.full-h-reset .over-fill {
		transition: none;
	}

	.shade-reset .over-fill,
	.full-h-reset .over-fill {
		animation: rollover-overlay var(--duration-normal) var(--ease-standard) both;
	}

	.full-h-reset .fill {
		animation: rollover-background var(--duration-normal) var(--ease-standard) both;
	}

	@keyframes rollover-overlay {
		from {
			width: 0;
		}
		to {
			width: var(--over-progress-width);
		}
	}

	@keyframes rollover-background {
		from {
			background-color: var(--progress-heavy);
		}
		to {
			background-color: var(--progress-color);
		}
	}

	.title,
	.status {
		position: relative;
		z-index: 1;
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-size-lg);
	}

	.status {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2rem;
		color: var(--color-muted);
		font-size: var(--font-size-sm);
	}

	.row-actions {
		display: flex;
		gap: var(--space-0);
		opacity: 0;
		overflow: hidden;
		pointer-events: none;
		transition: opacity var(--duration-normal) var(--ease-standard);
	}

	.editing .row-actions {
		opacity: 1;
		pointer-events: auto;
	}

	.row-actions :global(button) {
		border-radius: var(--radius-1);
	}

	.row-actions :global(svg) {
		width: 1.15rem;
		height: 1.15rem;
	}

	.row-actions :global(button:nth-child(1) svg),
	.row-actions :global(button:nth-child(2) svg) {
		color: var(--color-muted);
	}

	.row-actions :global(button:nth-child(3) svg) {
		color: var(--color-danger);
	}

	@media (prefers-reduced-motion: reduce) {
		.fill,
		.over-fill {
			transition: none;
		}

		.shade-reset .over-fill,
		.full-h-reset .fill,
		.full-h-reset .over-fill {
			animation: none;
		}
	}
</style>
