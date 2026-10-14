<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TextInput from './TextInput.svelte';
	const { Story } = defineMeta({ title: 'Components/Primitives/Text Input', component: TextInput });
</script>

<Story name="Text and email">
	{#snippet template()}
		<div class="fields">
			<TextInput ariaLabel="Name" placeholder="Write something" /><TextInput
				type="email"
				ariaLabel="Email"
				placeholder="you@example.com"
			/>
		</div>
	{/snippet}
</Story>

<style>
	.fields {
		width: min(24rem, 80vw);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
