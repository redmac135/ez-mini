<script lang="ts">
	import { Button, Icon } from '@ez/ui';
	import type { ActionTask } from '$lib/action/types';
	import { formatDateChip, formatRepeatChip } from '$lib/action/parser';

	export let task: ActionTask;
	export let actionsOpen = false;
	export let onComplete: () => void = () => {};
	export let onToday: () => void = () => {};
	export let onOpenActions: () => void = () => {};
	export let onEdit: () => void = () => {};
	export let onDelete: () => void = () => {};

	let touchStart: { x: number; y: number } | null = null;
	const SWIPE_MIN_X = 56;
	const SWIPE_MAX_Y = 42;

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
			onToday();
			return;
		}

		onOpenActions();
	}
</script>

<div class:editing={actionsOpen} class="habit-shell">
	<button
		class:complete={task.completedAt !== null}
		class:today={task.today}
		class="habit-row"
		type="button"
		style="--progress: 0%"
		aria-label={task.title}
		on:click={onOpenActions}
		on:touchstart={handleTouchStart}
		on:touchend={handleTouchEnd}
	>
		<span class="fill"></span>
		<span
			class:checked={task.completedAt !== null}
			class="status"
			role="button"
			tabindex="0"
			aria-label={`Complete ${task.title}`}
			on:click|stopPropagation={onComplete}
			on:keydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					onComplete();
				}
			}}
		>
			{#if task.completedAt}
				<Icon name="check" />
			{/if}
		</span>
		<span class="content">
			<span class="title">{task.title}</span>
			{#if task.dueAt || task.plannedAt || task.repeatRule}
				<span class="descriptors">
					{#if task.dueAt}
						<span class="descriptor">
							<Icon name="calendar-days" />
							<span>{formatDateChip(task.dueAt)}</span>
						</span>
					{/if}
					{#if task.plannedAt}
						<span class="descriptor">
							<Icon name="pencil-square" />
							<span>{formatDateChip(task.plannedAt)}</span>
						</span>
					{/if}
					{#if task.repeatRule}
						<span class="descriptor">
							<Icon name="repeat" />
							<span>{formatRepeatChip(task.repeatRule)}</span>
						</span>
					{/if}
				</span>
			{/if}
		</span>
	</button>

	{#if actionsOpen}
		<div class="row-actions">
			<Button size="icon" ariaLabel={`Move ${task.title} to Today`} on:click={onToday}>
				<Icon name="calendar-days" />
			</Button>
			<Button size="icon" ariaLabel={`Edit ${task.title}`} on:click={onEdit}>
				<Icon name="pencil-square" />
			</Button>
			<Button size="icon" ariaLabel={`Delete ${task.title}`} on:click={onDelete}>
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
		grid-template-columns: auto minmax(0, 1fr);
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

	.habit-row.today {
		border-color: color-mix(in srgb, var(--color-fg), transparent 60%);
	}

	.habit-row.complete {
		color: var(--color-muted);
	}

	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--progress);
		background: color-mix(in srgb, var(--color-fg), transparent 94%);
		pointer-events: none;
		transition: width var(--duration-normal) var(--ease-standard);
	}

	.content,
	.title,
	.status {
		position: relative;
		z-index: 1;
	}

	.content {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-size-lg);
	}

	.complete .title {
		text-decoration: line-through;
	}

	.descriptors {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		color: var(--color-muted);
		font-size: var(--font-size-sm);
	}

	.descriptor {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}

	.descriptor :global(svg) {
		width: 0.95rem;
		height: 0.95rem;
	}

	.status {
		width: 1.15rem;
		height: 1.15rem;
		border: 1.5px solid var(--color-muted);
		border-radius: var(--radius-round);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-muted);
	}

	.status.checked {
		border-color: var(--color-muted);
	}

	.status :global(svg) {
		width: 0.85rem;
		height: 0.85rem;
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
