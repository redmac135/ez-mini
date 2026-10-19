<script lang="ts">
	import JourneyEntryCard from './JourneyEntryCard.svelte';
	import type { JourneyEntry } from './journey';

	let {
		label,
		entries,
		onOpen = () => {}
	}: {
		label: string;
		entries: JourneyEntry[];
		onOpen?: (entry: JourneyEntry, source: HTMLElement) => void;
	} = $props();
</script>

<section
	class="day-group"
	data-date={entries[0]
		? `${new Date(entries[0].createdAt).getFullYear()}-${String(new Date(entries[0].createdAt).getMonth() + 1).padStart(2, '0')}-${String(new Date(entries[0].createdAt).getDate()).padStart(2, '0')}`
		: ''}
	aria-label={label}
>
	<h2 class="day-heading"><span class="day-dot" aria-hidden="true"></span>{label}</h2>
	<ol class="day-entries">
		{#each entries as entry (entry.id)}
			<li><JourneyEntryCard {entry} {onOpen} /></li>
		{/each}
	</ol>
</section>

<style>
	.day-group {
		position: relative;
		padding-bottom: var(--space-5);
	}

	.day-heading {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		min-height: 2.5rem;
		margin: 0 0 var(--space-2) calc(-1 * var(--space-5));
		padding: var(--space-2) 0 var(--space-2) var(--space-5);
		background: var(--color-bg);
		color: var(--color-fg);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		line-height: 1.4;
	}

	.day-dot {
		position: absolute;
		top: 50%;
		left: 0.05rem;
		width: 0.62rem;
		height: 0.62rem;
		border: 1px solid var(--color-border);
		border-radius: 50%;
		background: var(--color-bg);
		transform: translateY(-50%);
	}

	:global(body[data-theme='light']) .day-dot {
		background: var(--color-border);
	}

	.day-entries {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
