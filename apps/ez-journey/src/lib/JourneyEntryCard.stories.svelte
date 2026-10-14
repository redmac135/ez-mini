<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import JourneyEntryCard from './JourneyEntryCard.svelte';
	import type { JourneyEntry } from './journey';

	const { Story } = defineMeta({
		title: 'Apps/Journey/Timeline Entry',
		component: JourneyEntryCard
	});

	const entry: JourneyEntry = {
		id: 'walk',
		text: 'Took a quiet walk after lunch and noticed the first leaves turning gold.',
		createdAt: '2026-10-14T12:35:00.000Z'
	};
</script>

<script lang="ts">
	let opened = false;
</script>

<Story
	name="Opens an entry"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: /open journal entry/i }));
		await expect(canvas.getByText('Entry selected')).toBeInTheDocument();
	}}
>
	{#snippet template()}
		<div class="frame">
			<JourneyEntryCard {entry} onOpen={() => (opened = true)} />
			{#if opened}<p>Entry selected</p>{/if}
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
