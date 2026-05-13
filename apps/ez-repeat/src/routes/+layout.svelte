<script lang="ts">
	import '@ez/design/tokens.css';

	let { children } = $props();
</script>

{@render children()}

<style>
	:global(body) {
		margin: 0;
		font-family: var(--font-family-mono);
	}
</style>
