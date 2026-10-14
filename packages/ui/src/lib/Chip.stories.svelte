<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Chip from './Chip.svelte';
	const { Story } = defineMeta({ title: 'Components/Primitives/Chip', component: Chip });
</script>

<Story name="Selection states">
	{#snippet template()}
		<div class="row">
			<Chip>Every day</Chip><Chip selected>Twice daily</Chip><Chip disabled>Disabled</Chip>
		</div>
	{/snippet}
</Story>

<style>
	.row {
		display: flex;
		gap: var(--space-2);
	}
</style>
