<script lang="ts">
	import type { CalendarDay } from '$lib/repeat/calendar';

	export let day: CalendarDay;
	export let onSelect: (dateKey: string) => void = () => {};

	$: shade = `${Math.round(day.score * 88)}%`;
</script>

<button
	class:selected={day.isSelected}
	class:today={day.isToday}
	class="day-cell"
	type="button"
	style={`--shade: ${shade}`}
	aria-label={day.dateKey}
	on:click={() => onSelect(day.dateKey)}
>
	<span class="cell-fill"></span>
</button>

<style>
	.day-cell {
		position: relative;
		aspect-ratio: 1;
		width: 100%;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
		background: var(--color-bg);
		color: inherit;
		cursor: pointer;
		padding: 0;
		transition: var(--theme-transition);
	}

	.day-cell:hover,
	.day-cell:focus-visible {
		background: var(--color-hover);
		border-color: color-mix(in srgb, var(--color-fg), transparent 78%);
		outline: none;
	}

	.day-cell.selected {
		border-color: var(--color-fg);
		box-shadow: inset 0 0 0 1px var(--color-fg);
	}

	.cell-fill {
		position: absolute;
		inset: 0;
		background: color-mix(in srgb, var(--color-fg) var(--shade), transparent);
		opacity: 0.82;
		pointer-events: none;
	}

	.day-cell.today::after {
		content: '';
		position: absolute;
		inset: 0;
		background-image: repeating-linear-gradient(
			135deg,
			color-mix(in srgb, var(--color-fg), transparent 68%) 0,
			color-mix(in srgb, var(--color-fg), transparent 68%) 1px,
			transparent 1px,
			transparent 4px
		);
		pointer-events: none;
	}
</style>
