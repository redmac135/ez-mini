<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DateNavigator from './DateNavigator.svelte';
	const { Story } = defineMeta({
		title: 'Apps/ez-repeat/Components/Date Navigator',
		component: DateNavigator
	});
</script>

<Story name="Today and another day">
	{#snippet template()}<div class="nav">
			<DateNavigator selectedDate="2026-10-14" todayDate="2026-10-14" /><DateNavigator
				selectedDate="2026-10-09"
				todayDate="2026-10-14"
			/>
		</div>{/snippet}
</Story>

<style>
	.nav {
		width: min(30rem, 82vw);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		font-family: var(--font-family-mono);
	}
</style>
