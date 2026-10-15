<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import JourneyDayGroup from './JourneyDayGroup.svelte';
	import type { JourneyEntry } from './journey';

	let {
		entries = [],
		onOpen = () => {}
	}: {
		entries?: JourneyEntry[];
		onOpen?: (entry: JourneyEntry, source: HTMLElement) => void;
	} = $props();

	const dateFormat = new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});
	const groups = $derived.by(() => {
		const sorted = [...entries].sort(
			(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
		);
		const grouped = new SvelteMap<string, { label: string; entries: JourneyEntry[] }>();
		for (const entry of sorted) {
			const date = new Date(entry.createdAt);
			const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
			const group = grouped.get(key) ?? { label: dateFormat.format(date), entries: [] };
			group.entries.push(entry);
			grouped.set(key, group);
		}
		return [...grouped.values()];
	});
</script>

<section class="timeline" aria-label="Journal entries by date">
	{#if groups.length}
		<div class="timeline-groups">
			{#each groups as group (group.label)}
				<JourneyDayGroup label={group.label} entries={group.entries} {onOpen} />
			{/each}
		</div>
	{/if}
</section>

<style>
	.timeline {
		width: 100%;
		margin: 0;
	}

	.timeline-groups {
		position: relative;
		padding-left: var(--space-5);
	}

	.timeline-groups::before {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0.35rem;
		width: 1px;
		background: var(--color-border);
		content: '';
	}
</style>
