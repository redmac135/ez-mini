<script lang="ts">
	import Button from './Button.svelte';

	export let accountName = 'your account';
	export let canceling = false;
	export let errorMessage = '';
	export let cancelable = true;
	export let onCancel: () => void = () => {};

	function showModal(node: HTMLDialogElement) {
		node.showModal();
		return {
			destroy() {
				if (node.open) node.close();
			}
		};
	}
</script>

<dialog
	use:showModal
	class="account-loading-scrim"
	aria-modal="true"
	aria-labelledby="account-loading-title"
	aria-describedby="account-loading-description"
	aria-busy="true"
>
	<section class="account-loading-panel">
		<div class="spinner" aria-hidden="true"></div>
		<h2 id="account-loading-title">Switching account</h2>
		<p id="account-loading-description">
			{canceling ? 'Returning to your previous account…' : `Loading data for ${accountName}…`}
		</p>
		{#if errorMessage}
			<p class="loading-error" role="alert">{errorMessage}</p>
		{/if}
		{#if cancelable}
			<Button disabled={canceling} on:click={onCancel}>
				{canceling ? 'Returning…' : errorMessage ? 'Try again' : 'Cancel and go back'}
			</Button>
		{/if}
	</section>
</dialog>

<style>
	.account-loading-scrim {
		position: fixed;
		inset: 0;
		z-index: 60;
		box-sizing: border-box;
		width: 100%;
		max-width: none;
		height: 100%;
		max-height: none;
		margin: 0;
		border: 0;
		display: grid;
		place-items: center;
		padding: var(--space-4);
		background: var(--color-bg);
		color: var(--color-fg);
	}

	.account-loading-panel {
		width: min(22rem, 100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		text-align: center;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-normal);
		color: var(--color-fg);
	}

	p {
		font-size: var(--font-size-md);
		color: var(--color-muted);
	}

	.loading-error {
		color: var(--color-danger, var(--color-fg));
	}

	.spinner {
		width: 2.25rem;
		height: 2.25rem;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-fg);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 2s;
		}
	}
</style>
