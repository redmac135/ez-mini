<script lang="ts">
	export let maxWidth = '680px';
	export let topPadding = 'default';
</script>

<main
	class:compactTop={topPadding === 'compact'}
	class="workspace"
	style={`--workspace-max-width: ${maxWidth}`}
>
	<slot />
</main>

<style>
	.workspace {
		width: 100%;
		max-width: var(--workspace-max-width);
		min-height: 100vh;
		box-sizing: border-box;
		margin: 0 auto;
		padding: calc(var(--space-8) + env(safe-area-inset-top)) var(--space-5) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		font-family: var(--font-family-mono);
	}

	@media (max-width: 560px) {
		.workspace {
			padding: calc(var(--space-8) + var(--space-2) + env(safe-area-inset-top)) var(--space-5)
				var(--space-6);
			gap: var(--space-4);
		}
	}

	.workspace.compactTop {
		padding-top: var(--space-8);
	}
</style>
