<script lang="ts">
	let { children } = $props();
</script>

<div class="app-shell">
	{@render children()}
</div>

<style>
	.app-shell {
		position: relative;
		min-height: 100vh;
		background-color: var(--color-bg);
		color: var(--color-fg);
		transition: var(--theme-transition);
	}
</style>
