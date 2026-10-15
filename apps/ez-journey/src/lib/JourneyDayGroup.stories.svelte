<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import JourneyDayGroup from './JourneyDayGroup.svelte';
	import type { JourneyEntry } from './journey';

	const { Story } = defineMeta({
		title: 'Apps/Journey/Timeline Day',
		component: JourneyDayGroup
	});

	const entries: JourneyEntry[] = [
		{
			id: 'morning',
			text: 'Coffee by the window and a few pages of my book.',
			createdAt: '2026-10-14T08:20:00.000Z'
		},
		{
			id: 'walk',
			text: 'A quiet walk after lunch. The first leaves are turning gold.',
			createdAt: '2026-10-14T12:35:00.000Z'
		}
	];
</script>

<script lang="ts">
	let openedId = '';
</script>

<Story
	name="Entries grouped under a day"
	play={async ({ canvas, userEvent }) => {
		await expect(canvas.getByRole('heading', { name: 'Wed, October 14, 2026' })).toBeVisible();
		await expect(canvas.getAllByRole('button', { name: /open journal entry/i })).toHaveLength(2);
		await userEvent.click(canvas.getByRole('button', { name: /open journal entry from 8:20/i }));
		await expect(canvas.getByText('Opened morning')).toBeInTheDocument();
	}}
>
	{#snippet template()}
		<div class="frame">
			<JourneyDayGroup
				label="Wed, October 14, 2026"
				{entries}
				onOpen={(entry) => (openedId = entry.id)}
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
