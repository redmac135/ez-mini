<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AppShell from './AppShell.svelte';
	const { Story } = defineMeta({ title: 'Components/Layouts/App Shell', component: AppShell });
</script>

<Story name="Application surface">
	{#snippet template()}
		<AppShell
			><div class="surface">
				<h1>AppShell</h1>
				<p>Viewport level background and foreground.</p>
			</div></AppShell
		>
	{/snippet}
</Story>

<style>
	.surface {
		min-width: min(32rem, 75vw);
		min-height: 12rem;
		padding: var(--space-5);
		background: var(--color-bg);
		color: var(--color-fg);
		font-family: var(--font-family-mono);
	}
</style>
