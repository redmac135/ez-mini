<script lang="ts">
	import { Icon } from '@ez/ui';
	import { formatDateHeading } from '$lib/repeat/dates';

	export let selectedDate: string;
	export let todayDate: string;
	export let onMove: (delta: number) => void = () => {};

	$: heading = formatDateHeading(selectedDate, todayDate);
</script>

<div class="date-bar">
	<div class="date-control">
		<button type="button" aria-label="Previous day" on:click={() => onMove(-1)}>
			<Icon name="chevron-left" />
		</button>
		<h1>{heading}</h1>
		<button type="button" aria-label="Next day" on:click={() => onMove(1)}>
			<Icon name="chevron-right" />
		</button>
	</div>
</div>

<style>
	.date-bar {
		display: flex;
		justify-content: center;
		width: 100%;
	}

	.date-control {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr) 2rem;
		align-items: center;
		gap: var(--space-2);
		justify-self: center;
		width: min(28rem, 100%);
	}

	button {
		border: 0;
		border-radius: var(--radius-1);
		background: transparent;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2rem;
		padding: 0;
		transition: var(--theme-transition);
	}

	button:hover {
		background: var(--color-hover);
	}

	button :global(svg) {
		width: 1.1rem;
		height: 1.1rem;
	}

	h1 {
		margin: 0;
		overflow: hidden;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-normal);
		line-height: var(--line-height-tight);
	}

	@media (max-width: 560px) {
		h1 {
			font-size: var(--font-size-lg);
		}
	}
</style>
