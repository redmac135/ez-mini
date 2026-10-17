<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import ConnectedAccountsModal from './ConnectedAccountsModal.svelte';

	const { Story } = defineMeta({
		title: 'Components/Patterns/Connected Accounts Modal',
		component: ConnectedAccountsModal
	});

	const identities = [
		{
			id: 'identity-email',
			provider: 'email',
			displayName: 'Taylor',
			email: 'taylor@example.com',
			createdAt: '2026-01-01T00:00:00.000Z'
		},
		{
			id: 'identity-github',
			provider: 'github',
			displayName: 'taylor-dev',
			email: 'taylor@example.com',
			createdAt: '2026-01-02T00:00:00.000Z'
		}
	];
</script>

<script lang="ts">
	let actionMessage = $state('');
	let profileDraft = $state('taylor-dev');
</script>

<Story name="Email and GitHub connected" args={{ identities }}>
	{#snippet template(args)}
		<ConnectedAccountsModal {...args} onClose={() => {}} />
	{/snippet}
</Story>

<Story
	name="Edit display name"
	args={{ identities, displayName: 'taylor-dev', displayNameDraft: 'taylor-dev' }}
	play={async ({ canvas, userEvent }) => {
		const input = canvas.getByRole('textbox', { name: 'Display name' });
		await userEvent.clear(input);
		await userEvent.type(input, 'Taylor');
		await expect(canvas.getByRole('button', { name: 'Save' })).toBeEnabled();
	}}
>
	{#snippet template(args)}
		<ConnectedAccountsModal
			{...args}
			displayNameDraft={profileDraft}
			onClose={() => {}}
			onDisplayNameInput={(value) => (profileDraft = value)}
			onSaveDisplayName={() => (actionMessage = 'Saved Taylor')}
			onCancelDisplayName={() => (profileDraft = 'taylor-dev')}
		/>
		<p aria-live="polite">{actionMessage}</p>
	{/snippet}
</Story>

<Story
	name="Connect Microsoft"
	args={{ identities }}
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Connect Microsoft' }));
		await expect(canvas.getByText('Connecting Microsoft')).toBeVisible();
	}}
>
	{#snippet template(args)}
		<ConnectedAccountsModal
			{...args}
			onClose={() => {}}
			onConnect={(provider) =>
				(actionMessage = `Connecting ${provider === 'azure' ? 'Microsoft' : 'GitHub'}`)}
		/>
		<p aria-live="polite">{actionMessage}</p>
	{/snippet}
</Story>

<Story name="Disconnect confirmation" args={{ identities }}>
	{#snippet template(args)}
		<ConnectedAccountsModal {...args} onClose={() => {}} />
	{/snippet}
</Story>

<Story name="Loading identities" args={{ identities: [], loading: true }}>
	{#snippet template(args)}<ConnectedAccountsModal {...args} onClose={() => {}} />{/snippet}
</Story>

<Story
	name="Last sign-in method cannot be disconnected"
	args={{ identities: [identities[0]] }}
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
		await expect(
			canvas.getByText('Connect another sign-in method before disconnecting this one.')
		).toBeVisible();
	}}
>
	{#snippet template(args)}<ConnectedAccountsModal {...args} onClose={() => {}} />{/snippet}
</Story>
