<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import FloatingMenu from './FloatingMenu.svelte';
	const { Story } = defineMeta({
		title: 'Components/Patterns/Floating Menu',
		component: FloatingMenu
	});
</script>

<script lang="ts">
	let menuOpen = $state(false);
</script>

<Story name="Menu items">
	{#snippet template()}
		<div class="anchor">
			<button type="button">Open menu</button><FloatingMenu label="Example actions"
				><button type="button">Rename</button><button type="button">Duplicate</button>
				<div class="menu-stat">Synced just now</div></FloatingMenu
			>
		</div>
	{/snippet}
</Story>

<Story
	name="Dismiss on outside click"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Open menu' }));
		await expect(canvas.getByRole('menu', { name: 'Example actions' })).toBeInTheDocument();
		await userEvent.click(canvas.getByRole('button', { name: 'Outside area' }));
		await expect(canvas.queryByRole('menu', { name: 'Example actions' })).not.toBeInTheDocument();
	}}
>
	{#snippet template()}
		<div class="anchor">
			<button type="button" onclick={() => (menuOpen = !menuOpen)}>Open menu</button>
			{#if menuOpen}
				<FloatingMenu label="Example actions" onDismiss={() => (menuOpen = false)}>
					<button type="button">Rename</button>
				</FloatingMenu>
			{/if}
		</div>
		<button type="button">Outside area</button>
	{/snippet}
</Story>

<style>
	.anchor {
		position: relative;
		min-width: 16rem;
		min-height: 9rem;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		color: var(--color-fg);
	}
	.anchor > button {
		padding: var(--space-2);
		border: 0;
		background: var(--color-hover);
		color: inherit;
		font: inherit;
	}
</style>
