<script lang="ts">
	import { Button, Icon } from '@ez/ui';
	import type { HabitProgress } from '$lib/repeat/types';

	export let progress: HabitProgress;
	export let editMode = false;
	export let onComplete: (progress: HabitProgress) => void = () => {};
	export let onUndo: (progress: HabitProgress) => void = () => {};
	export let onEdit: (progress: HabitProgress) => void = () => {};
	export let onArchive: (progress: HabitProgress) => void = () => {};
	export let onDelete: (progress: HabitProgress) => void = () => {};

	let touchStart: { x: number; y: number } | null = null;
	const SWIPE_MIN_X = 56;
	const SWIPE_MAX_Y = 42;

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
		class="habit-row"
		type="button"
		style={`--progress: ${Math.round(progress.ratio * 100)}%`}
		aria-label={`${progress.habit.title}, ${progress.count} of ${progress.target}`}
		on:click={() => onComplete(progress)}
		on:contextmenu={handleContextMenu}
		on:touchstart={handleTouchStart}
		on:touchend={handleTouchEnd}
	>
		<span class="fill"></span>
		<span class="title">{progress.habit.title}</span>
		<span class="status">
			{#if progress.complete}
				<Icon name="check" />
			{:else}
				{progress.count}/{progress.target}
			{/if}
		</span>
	</button>

	{#if editMode}
		<div class="row-actions">
			<Button
				size="icon"
				ariaLabel={`Edit ${progress.habit.title}`}
				on:click={() => onEdit(progress)}
			>
				<Icon name="pencil-square" />
			</Button>
			<Button
				size="icon"
				ariaLabel={`Archive ${progress.habit.title}`}
				on:click={() => onArchive(progress)}
			>
				<Icon name="archive-box" />
			</Button>
			<Button
				size="icon"
				ariaLabel={`Delete ${progress.habit.title}`}
				on:click={() => onDelete(progress)}
			>
				<Icon name="trash" />
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

	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--progress);
		background: color-mix(in srgb, var(--color-fg), transparent 94%);
		pointer-events: none;
		transition: width var(--duration-normal) var(--ease-standard);
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
</style>
