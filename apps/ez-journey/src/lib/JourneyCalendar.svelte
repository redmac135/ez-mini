<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from '@ez/ui';
	import type { JourneyEntry } from './journey';
	import {
		calendarYears,
		journeyDateKey,
		moveCalendarDate
	} from './journey/navigation';
	let {
		selectedDate,
		entries,
		onSelect,
		onClose
	}: {
		selectedDate: string;
		entries: JourneyEntry[];
		onSelect: (date: string) => void;
		onClose: () => void;
	} = $props();
	let shown = $state(new Date());
	let view = $state<'day' | 'month' | 'year'>('day');
	const monthNames = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const years = $derived(calendarYears(shown.getFullYear()));
	const days = $derived.by(() => {
		const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
		const count = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
		return Array.from({ length: Math.ceil((first.getDay() + count) / 7) * 7 }, (_, i) => {
			const date = new Date(shown.getFullYear(), shown.getMonth(), i - first.getDay() + 1);
			return { date, current: date.getMonth() === shown.getMonth() };
		});
	});
	const entryDays = $derived(
		new Set(entries.map((entry) => journeyDateKey(new Date(entry.createdAt))))
	);
	function key(date: Date) {
		return journeyDateKey(date);
	}
	function move(amount: number) {
		shown = moveCalendarDate(shown, view, amount);
	}
	function dismiss(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
	onMount(() => {
		shown = new Date(`${selectedDate}T12:00:00`);
		window.addEventListener('keydown', dismiss);
		return () => window.removeEventListener('keydown', dismiss);
	});
</script>

<div
	class="backdrop"
	onclick={(event) => {
		if (event.target === event.currentTarget) onClose();
	}}
	role="presentation"
>
	<section class="picker" aria-label="Choose a date">
		<header>
			<div class="labels">
				<button onclick={() => (view = 'month')}>{monthNames[shown.getMonth()]}</button><button
					onclick={() => (view = 'year')}>{shown.getFullYear()}</button
				>
			</div>
			<div class="arrows">
				<button aria-label="Previous" onclick={() => move(-1)}><Icon name="chevron-left" /></button
				><button aria-label="Next" onclick={() => move(1)}><Icon name="chevron-right" /></button>
			</div>
		</header>
		{#if view === 'day'}
			<div class="week">
				{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day}<span>{day}</span>{/each}
			</div>
			<div class="grid">
				{#each days as item (key(item.date))}<button
						class:outside={!item.current}
						class:selected={key(item.date) === selectedDate}
						class:today={key(item.date) === journeyDateKey(new Date())}
						aria-label={key(item.date)}
						onclick={() => onSelect(key(item.date))}
						>{item.date.getDate()}{#if entryDays.has(key(item.date))}<i></i>{/if}</button
					>{/each}
			</div>
		{:else if view === 'month'}<div class="grid months">
				{#each monthNames as month, index}<button
						class:selected={shown.getMonth() === index}
						onclick={() => {
							shown = new Date(shown.getFullYear(), index, 1);
							view = 'day';
						}}>{month}</button
					>{/each}
			</div>
		{:else}<div class="grid months">
				{#each years as year}<button
						class:selected={shown.getFullYear() === year}
						onclick={() => {
							shown = new Date(year, shown.getMonth(), 1);
							view = 'month';
						}}>{year}</button
					>{/each}
			</div>{/if}
	</section>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
	}
	.picker {
		position: absolute;
		right: var(--space-5);
		top: calc(max(var(--space-3), env(safe-area-inset-top)) + 3.25rem);
		width: 19rem;
		padding: var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-bg);
		box-shadow: 0 12px 38px #0002;
		animation: appear 140ms ease-out;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-3);
	}
	button {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		border-radius: var(--radius-1);
		cursor: pointer;
	}
	.labels,
	.arrows {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.labels button {
		font-weight: var(--font-weight-medium);
		padding: 0.35rem;
	}
	.arrows button {
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
	}
	.arrows :global(svg) {
		width: 1rem;
		height: 1rem;
	}
	.week,
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		text-align: center;
	}
	.week span {
		font-size: var(--font-size-xs);
		color: var(--color-muted);
		padding: 0.4rem;
	}
	.grid button {
		height: 2.15rem;
		position: relative;
	}
	.grid button:hover {
		background: color-mix(in srgb, var(--color-fg) 8%, transparent);
	}
	.grid .outside {
		color: var(--color-muted);
		opacity: 0.45;
	}
	.grid .selected {
		background: var(--color-fg);
		color: var(--color-bg);
	}
	.grid .today:not(.selected) {
		outline: 1px solid var(--color-fg);
	}
	.grid i {
		position: absolute;
		bottom: 3px;
		left: 50%;
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: currentColor;
		transform: translateX(-50%);
	}
	.months {
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-2);
	}
	.months button {
		height: 2.6rem;
	}
	.months .selected {
		background: color-mix(in srgb, var(--color-fg) 12%, transparent);
	}
	@keyframes appear {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (max-width: 600px) {
		.backdrop {
			background: #0005;
		}
		.picker {
			inset: auto 0 0;
			width: auto;
			border-radius: var(--radius-2) var(--radius-2) 0 0;
			padding: var(--space-5) var(--space-5) calc(var(--space-5) + env(safe-area-inset-bottom));
			animation: sheet 180ms ease-out;
		}
		.grid button {
			height: 2.7rem;
		}
		@keyframes sheet {
			from {
				transform: translateY(20px);
				opacity: 0.7;
			}
			to {
				transform: translateY(0);
				opacity: 1;
			}
		}
	}
</style>
