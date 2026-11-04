<script lang="ts">
	import type { JourneyEntry } from './journey';

	let {
		entry,
		onOpen = () => {}
	}: {
		entry: JourneyEntry;
		onOpen?: (entry: JourneyEntry, source: HTMLElement) => void;
	} = $props();

	const timeFormat = new Intl.DateTimeFormat(undefined, {
		hour: 'numeric',
		minute: '2-digit'
	});
	let source: HTMLButtonElement;
	let createdAt = $derived(new Date(entry.createdAt));
</script>

<button
	bind:this={source}
	type="button"
	class="entry-card"
	data-entry-id={entry.id}
	aria-label={`Open journal entry from ${timeFormat.format(createdAt)}`}
	onclick={() => onOpen(entry, source)}
>
	<time class="entry-time" datetime={entry.createdAt}>
		{timeFormat.format(createdAt)}
	</time>
	<span class="entry-text">{entry.text}</span>
</button>

<style>
	.entry-card {
		scroll-margin-top: 3.25rem;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid color-mix(in srgb, var(--color-fg) 13%, transparent);
		border-radius: var(--radius-1);
		background: var(--color-bg);
		color: var(--color-fg);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition:
			background-color var(--duration-normal) var(--ease-standard),
			border-color var(--duration-normal) var(--ease-standard);
	}

	.entry-card:hover {
		border-color: color-mix(in srgb, var(--color-fg) 24%, transparent);
		background: color-mix(in srgb, var(--color-fg) 5%, var(--color-bg));
	}

	.entry-card:focus-visible {
		outline: 2px solid var(--color-fg);
		outline-offset: 2px;
	}

	.entry-time {
		color: var(--color-subtle);
		font-size: var(--font-size-xs);
		line-height: 1.3;
	}

	.entry-text {
		white-space: pre-wrap;
		line-height: 1.7;
	}
</style>
