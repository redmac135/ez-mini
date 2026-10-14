<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	export let canceling = false;
	export let errorMessage = '';
	export let cancelable = true;
	export let onCancel: () => void = () => {};

	let showLoadingControls = false;

	onMount(() => {
		const timeout = window.setTimeout(() => (showLoadingControls = true), 1000);
		return () => window.clearTimeout(timeout);
	});

	function preventDismiss(event: Event) {
		event.preventDefault();
	}

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
	transition:fade={{ duration: 180 }}
	class="account-loading-scrim"
	aria-modal="true"
	aria-label="Switching account"
	aria-busy="true"
	on:cancel={preventDismiss}
>
	<section class="account-loading-panel">
		{#if showLoadingControls}
			<div class="spinner" role="status" aria-label="Loading account data"></div>
			{#if errorMessage}
				<p role="alert">{errorMessage}</p>
			{/if}
			{#if cancelable}
				<button class="cancel" type="button" disabled={canceling} on:click={onCancel}>
					{canceling ? 'Canceling…' : 'Cancel'}
				</button>
			{/if}
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
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		text-align: center;
	}

	p {
		max-width: 22rem;
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-muted);
	}

	.spinner {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-fg);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.cancel {
		border: 0;
		padding: var(--space-1);
		background: transparent;
		color: var(--color-muted);
		font: inherit;
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.cancel:hover:not(:disabled) {
		color: var(--color-fg);
		text-decoration: underline;
	}

	.cancel:focus-visible {
		outline: 2px solid var(--color-fg);
		outline-offset: 2px;
	}

	.cancel:disabled {
		cursor: wait;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
