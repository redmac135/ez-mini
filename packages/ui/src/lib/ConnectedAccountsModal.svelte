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
		if (provider === 'github') return 'GitHub';
		return provider.slice(0, 1).toUpperCase() + provider.slice(1);
	}
</script>

<Modal title="Profile" {onClose}>
	{#if loading}
		<p class="status" role="status">Loading login methods…</p>
	{/if}
	<section class="profile-section" aria-labelledby="display-name-heading">
		<h3 id="display-name-heading">Display name</h3>
		<input
			id="account-display-name"
			aria-labelledby="display-name-heading"
			aria-invalid={!displayNameDraft.trim()}
			class:invalid={!displayNameDraft.trim()}
			value={displayNameDraft}
			maxlength="80"
			autocomplete="nickname"
			disabled={loading || displayNameSaving}
			oninput={(event) => onDisplayNameInput(event.currentTarget.value)}
		/>
	</section>
	<section class="methods-section" aria-labelledby="login-methods-heading">
		<h3 id="login-methods-heading">Login methods</h3>
		{#if identities.length > 0}
			<ul class="identity-list">
				{#each identities as identity (identity.id)}
					<li>
						<div class="identity-copy">
							<strong>{getProviderName(identity.provider)}</strong>
							<span>{identity.displayName ?? identity.email ?? 'Connected'}</span>
						</div>
						<Button
							size="sm"
							variant={identities.length < 2 ? 'ghost' : 'danger'}
							disabled={identities.length < 2 || busyIdentityId !== null || busyProvider !== null}
							onclick={() => (pendingUnlink = identity)}
						>
							{busyIdentityId === identity.id ? 'Disconnecting…' : 'Disconnect'}
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
	<div class="connect-actions">
		{#if !hasGithub}
			<button
				type="button"
				class="connect-link"
				disabled={loading || busyProvider !== null || busyIdentityId !== null}
				onclick={() => onConnect('github')}
			>
				{busyProvider === 'github' ? 'Connecting…' : '+ GitHub'}
			</button>
		{/if}
		{#if !hasMicrosoft}
			<button
				type="button"
				class="connect-link"
				disabled={loading || busyProvider !== null || busyIdentityId !== null}
				onclick={() => onConnect('azure')}
			>
				{busyProvider === 'azure' ? 'Connecting…' : '+ Microsoft'}
			</button>
		{/if}
	</div>
	<svelte:fragment slot="actions">
		<Button
			disabled={displayNameSaving || busyIdentityId !== null || busyProvider !== null}
			onclick={() => {
				onCancelDisplayName();
				onClose();
			}}>Cancel</Button
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
		message="This login method will be removed from this account everywhere. You can still sign in with another login method."
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
	.status {
		margin: 0 0 var(--space-2);
		font-size: var(--font-size-xs);
		color: var(--color-muted);
	}
	.profile-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-4);
	}
	.profile-section h3,
	.methods-section h3 {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-normal);
		color: var(--color-fg);
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
	.profile-section input.invalid {
		border-color: var(--color-danger);
	}
	.methods-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
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
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}
	.connect-link {
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--color-muted);
		font: inherit;
		font-size: var(--font-size-sm);
		text-align: left;
		cursor: pointer;
	}
	.connect-link:hover:not(:disabled) {
		color: var(--color-fg);
		text-decoration: underline;
	}
	.connect-link:disabled {
		cursor: default;
		opacity: 0.55;
	}
</style>
