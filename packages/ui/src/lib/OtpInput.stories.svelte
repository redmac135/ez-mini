<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OtpInput from './OtpInput.svelte';
	const { Story } = defineMeta({ title: 'Components/Primitives/OTP Input', component: OtpInput });
</script>

<Story name="Empty, partial, and invalid">
	{#snippet template()}
		<div class="states">
			<OtpInput /><OtpInput value="381" /><OtpInput value="12345678" disabled /><OtpInput
				value="00000000"
				shake
			/>
		</div>
	{/snippet}
</Story>

<style>
	.states {
		width: min(28rem, 84vw);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
</style>
