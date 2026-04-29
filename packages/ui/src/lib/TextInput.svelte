<script lang="ts">
	export let value = '';
	export let type = 'text';
	export let placeholder = '';
	export let autocomplete: 'email' | 'off' | 'on' | '' = '';
	export let ariaLabel = '';
</script>

<input
	bind:value
	{type}
	{placeholder}
	{autocomplete}
	aria-label={ariaLabel || undefined}
	on:keydown
/>

<style>
	input {
		width: 100%;
		box-sizing: border-box;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background: transparent;
		color: inherit;
		font: inherit;
	}

	input:focus {
		outline: none;
		border-color: var(--color-fg);
	}
</style>
