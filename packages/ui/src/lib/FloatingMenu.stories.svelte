<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FloatingMenu from './FloatingMenu.svelte';
	const { Story } = defineMeta({
		title: 'Components/Patterns/Floating Menu',
		component: FloatingMenu
	});
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
