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
		background: var(--color-bg);
		color: var(--color-fg);
	}
</style>
