<script lang="ts">
	import { Button, Modal } from '@ez/ui';

	export let title: string;
	export let message: string;
	export let actionLabel: string;
	export let danger = false;
	export let onCancel: () => void = () => {};
	export let onConfirm: () => void = () => {};
</script>

<Modal {title} onClose={onCancel}>
	<p>{message}</p>
	<svelte:fragment slot="actions">
		<Button on:click={onCancel}>Cancel</Button>
		<Button variant={danger ? 'danger' : 'primary'} on:click={onConfirm}>{actionLabel}</Button>
	</svelte:fragment>
</Modal>
