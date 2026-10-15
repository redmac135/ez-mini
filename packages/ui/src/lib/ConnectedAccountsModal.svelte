<script lang="ts">
	import Button from './Button.svelte';
	import ConfirmModal from './ConfirmModal.svelte';
	import Modal from './Modal.svelte';
	type OAuthProvider = 'github' | 'azure';
	type AuthIdentity = {
		id: string;
		provider: string;
		displayName: string | null;
		email: string | null;
		createdAt: string | null;
	};

	export let identities: AuthIdentity[] = [];
	export let loading = false;
	export let busyProvider: OAuthProvider | null = null;
	export let busyIdentityId: string | null = null;
	export let displayName = '';
	export let displayNameDraft = '';
	export let displayNameSaving = false;
	export let message = '';
	export let onClose: () => void = () => {};
	export let onConnect: (provider: OAuthProvider) => void = () => {};
	export let onUnlink: (identityId: string) => void = () => {};
	export let onDisplayNameInput: (value: string) => void = () => {};
	export let onSaveDisplayName: () => void = () => {};
	export let onCancelDisplayName: () => void = () => {};

	let pendingUnlink: AuthIdentity | null = null;
	let hasGithub = false;
	let hasMicrosoft = false;

	$: hasGithub = identities.some((identity) => identity.provider === 'github');
	$: hasMicrosoft = identities.some((identity) => identity.provider === 'azure');

	function getProviderName(provider: string) {
		if (provider === 'azure') return 'Microsoft';
		if (provider === 'email') return 'Email';
		return provider.slice(0, 1).toUpperCase() + provider.slice(1);
	}
</script>

<Modal title="Connected accounts" {onClose}>
	<p class="intro">
		Manage the sign-in methods connected to this account. Changes apply anywhere you use this
		account.
	</p>
	{#if loading}
		<p class="status" role="status">Loading connected accounts…</p>
	{:else if identities.length === 0}
		<p class="status">No sign-in methods were returned.</p>
	{:else}
		<ul class="identity-list">
			{#each identities as identity (identity.id)}
				<li>
					<div class="identity-copy">
						<strong>{getProviderName(identity.provider)}</strong>
						<span>{identity.displayName ?? identity.email ?? 'Connected'}</span>
					</div>
					<Button
						size="sm"
						variant="danger"
						disabled={identities.length < 2 || busyIdentityId !== null || busyProvider !== null}
						onclick={() => (pendingUnlink = identity)}
					>
						{busyIdentityId === identity.id ? 'Disconnecting…' : 'Disconnect'}
					</Button>
				</li>
			{/each}
		</ul>
		{#if identities.length < 2}
			<p class="hint">Connect another sign-in method before disconnecting this one.</p>
		{/if}
	{/if}
	{#if message}<p class="message" role="alert">{message}</p>{/if}
	<section class="profile-section" aria-labelledby="display-name-heading">
		<h3 id="display-name-heading">Profile</h3>
		<label for="account-display-name">Display name</label>
		<input
			id="account-display-name"
			value={displayNameDraft}
			maxlength="80"
			autocomplete="nickname"
			disabled={loading || displayNameSaving}
			oninput={(event) => onDisplayNameInput(event.currentTarget.value)}
		/>
		<p class="hint">Used across your apps. Defaults to a connected username or your email.</p>
	</section>
	<div class="connect-actions">
		{#if !hasGithub}
			<Button
				disabled={loading || busyProvider !== null || busyIdentityId !== null}
				onclick={() => onConnect('github')}
			>
				{busyProvider === 'github' ? 'Connecting…' : 'Connect GitHub'}
			</Button>
		{/if}
		{#if !hasMicrosoft}
			<Button
				disabled={loading || busyProvider !== null || busyIdentityId !== null}
				onclick={() => onConnect('azure')}
			>
				{busyProvider === 'azure' ? 'Connecting…' : 'Connect Microsoft'}
			</Button>
		{/if}
	</div>
	<svelte:fragment slot="actions">
		<Button
			disabled={loading || displayNameSaving || busyIdentityId !== null || busyProvider !== null}
			onclick={onCancelDisplayName}>Cancel</Button
		>
		<Button
			variant="primary"
			disabled={loading ||
				displayNameSaving ||
				busyIdentityId !== null ||
				busyProvider !== null ||
				!displayNameDraft.trim() ||
				displayNameDraft.trim() === displayName}
			onclick={onSaveDisplayName}>{displayNameSaving ? 'Saving…' : 'Save'}</Button
		>
	</svelte:fragment>
</Modal>

{#if pendingUnlink}
	<ConfirmModal
		title={`Disconnect ${getProviderName(pendingUnlink.provider)}?`}
		message="This sign-in method will be removed from this account everywhere. You can still sign in with another connected method."
		actionLabel="Disconnect"
		danger
		onCancel={() => (pendingUnlink = null)}
		onConfirm={() => {
			const identity = pendingUnlink;
			pendingUnlink = null;
			if (identity) onUnlink(identity.id);
		}}
	/>
{/if}

<style>
	.intro {
		margin: 0 0 var(--space-3);
	}
	.status,
	.message,
	.hint {
		margin: var(--space-2) 0;
	}
	.message {
		color: var(--color-danger);
	}
	.profile-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-top: var(--space-4);
	}
	.profile-section h3 {
		margin: 0 0 var(--space-1);
		font-size: var(--font-size-md);
	}
	.profile-section label {
		font-size: var(--font-size-sm);
	}
	.profile-section input {
		width: 100%;
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
		background: var(--color-bg);
		color: var(--color-fg);
		font: inherit;
	}
	.profile-section input:focus-visible {
		outline: 2px solid var(--color-fg);
		outline-offset: 2px;
	}
	.hint {
		font-size: var(--font-size-xs);
	}
	.identity-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: 0;
		margin: 0;
	}
	.identity-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-1);
	}
	.identity-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.identity-copy strong,
	.identity-copy span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.identity-copy span {
		font-size: var(--font-size-xs);
	}
	.connect-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
</style>
