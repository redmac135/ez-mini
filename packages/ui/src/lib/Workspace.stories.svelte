<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Workspace from './Workspace.svelte';
	const { Story } = defineMeta({ title: 'Components/Layouts/Workspace', component: Workspace });
</script>

<Story name="Default and compact top spacing">
	{#snippet template()}
		<div class="examples">
			<Workspace
				><h2>Default workspace</h2>
				<p>Centered writing surface with a readable maximum width.</p></Workspace
			><Workspace topPadding="compact"
				><h2>Compact top spacing</h2>
				<p>Useful when app chrome already reserves space.</p></Workspace
			>
		</div>
	{/snippet}
</Story>

<style>
	.examples {
		display: flex;
		gap: var(--space-4);
		width: min(48rem, 80vw);
		min-height: 18rem;
	}
	.examples :global(main) {
		min-height: 18rem;
		border: 1px solid var(--color-border);
	}
</style>
