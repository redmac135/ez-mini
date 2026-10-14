<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import JourneyTimeline from './JourneyTimeline.svelte';
	import type { JourneyEntry } from './journey';

	const { Story } = defineMeta({
		title: 'Apps/Journey/Timeline',
		component: JourneyTimeline
	});

	const entries: JourneyEntry[] = [
		{
			id: 'morning',
			text: 'A slow start, coffee by the window, and a few pages of my book.',
			createdAt: '2026-10-14T08:20:00.000Z'
		},
		{
			id: 'walk',
			text: 'Took a quiet walk after lunch and noticed the first leaves turning gold.',
			createdAt: '2026-10-13T12:35:00.000Z'
		}
	];
</script>

<script lang="ts">
	let openedId = '';
</script>

<Story name="Entries and empty state">
	{#snippet template()}
		<div class="frame">
			<JourneyTimeline
				{entries}
				onOpen={(entry) => {
					openedId = entry.id;
				}}
			/>
			{#if openedId}<p>Opened {openedId}</p>{/if}
			<JourneyTimeline entries={[]} />
		</div>
	{/snippet}
</Story>

<Story
	name="Clicking an entry selects it"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: /open journal entry/i }));
		await expect(canvas.getByText('Opened morning')).toBeInTheDocument();
	}}
>
	{#snippet template()}
		<div class="frame">
			<JourneyTimeline
				entries={entries.slice(0, 1)}
				onOpen={(entry) => {
					openedId = entry.id;
				}}
			/>
			{#if openedId}<p>Opened {openedId}</p>{/if}
		</div>
	{/snippet}
</Story>

<style>
	.frame {
		width: min(42rem, 90vw);
		padding: var(--space-5);
		color: var(--color-fg);
		font-family: var(--font-family-mono);
	}
</style>
