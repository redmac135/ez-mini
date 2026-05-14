<script lang="ts">
	import { Button, FloatingMenu, Icon } from '@ez/ui';
	import { addDays, getTodayDateKey } from '$lib/action/dates';
	import { formatDateChip } from '$lib/action/parser';

	export let label: string;
	export let value: string | null;
	export let icon: 'calendar-days' | 'pencil-square' = 'calendar-days';
	export let open = false;
	export let nextWeekDate: () => string;
	export let onToggle: () => void = () => {};
	export let onSelect: (dateKey: string | null) => void = () => {};

	$: text = value ? formatDateChip(value) : '';
</script>

<div class="composer-control">
	<Button size="sm" ariaLabel={label} on:click={onToggle}>
		<Icon name={icon} />
		{#if text}
			<span>{text}</span>
		{/if}
	</Button>
	{#if open}
		<FloatingMenu {label} placement="top" verticalOffset="var(--space-2)">
			<button type="button" on:click={() => onSelect(null)}>None</button>
			<button type="button" on:click={() => onSelect(getTodayDateKey())}>Today</button>
			<button type="button" on:click={() => onSelect(addDays(getTodayDateKey(), 1))}>
				Tomorrow
			</button>
			<button type="button" on:click={() => onSelect(nextWeekDate())}>Next week</button>
		</FloatingMenu>
	{/if}
</div>

<style>
	.composer-control {
		position: relative;
	}

	.composer-control :global(button) {
		gap: var(--space-1);
		min-width: 2rem;
		min-height: 2rem;
		align-items: center;
		justify-content: center;
	}

	.composer-control :global(svg) {
		width: 1.1rem;
		height: 1.1rem;
	}
</style>
