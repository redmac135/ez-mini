<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import ConnectedAccountsModal from './ConnectedAccountsModal.svelte';

	const { Story } = defineMeta({
		title: 'Components/Patterns/Profile and Login Methods',
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

<Story
	name="Email and GitHub connected"
	args={{ identities, displayName: 'taylor-dev', displayNameDraft: 'taylor-dev' }}
>
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
		await expect(input).toHaveAttribute('aria-invalid', 'true');
		await expect(canvas.getByRole('button', { name: 'Save' })).toBeDisabled();
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
	name="Add Microsoft login method"
	args={{ identities }}
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: '+ Microsoft' }));
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
	name="Only login method"
	args={{ identities: [identities[0]] }}
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
		const github = canvas.getByRole('button', { name: '+ GitHub' });
		const microsoft = canvas.getByRole('button', { name: '+ Microsoft' });
		await expect(github).toBeVisible();
		await expect(microsoft).toBeVisible();
		const githubBounds = github.getBoundingClientRect();
		const microsoftBounds = microsoft.getBoundingClientRect();
		expect(microsoftBounds.top).toBeGreaterThan(githubBounds.top);
	}}
>
	{#snippet template(args)}<ConnectedAccountsModal {...args} onClose={() => {}} />{/snippet}
</Story>
