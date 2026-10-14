<script lang="ts">
	let {
		value = $bindable(''),
		type = 'text',
		placeholder = '',
		autocomplete = '',
		ariaLabel = '',
		onkeydown
	}: {
		value?: string;
		type?: string;
		placeholder?: string;
		autocomplete?: 'email' | 'off' | 'on' | '';
		ariaLabel?: string;
		onkeydown?: (event: KeyboardEvent) => void;
	} = $props();
</script>

<input
	bind:value
	{type}
	{placeholder}
	{autocomplete}
	aria-label={ariaLabel || undefined}
	{onkeydown}
/>

<style>
	input {
		width: 100%;
		box-sizing: border-box;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background-color: transparent;
		color: inherit;
		font: inherit;
		transition: var(--theme-transition);
	}

	input:focus {
		outline: none;
		border-color: var(--color-fg);
	}
</style>
