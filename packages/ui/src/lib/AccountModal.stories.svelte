<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AccountModal from './AccountModal.svelte';
	const { Story } = defineMeta({
		title: 'Components/Patterns/Account Modal',
		component: AccountModal
	});
	const accounts = [
		{
			sessionId: 'a',
			userId: 'user-a',
			username: 'Taylor',
			email: 'taylor@example.com',
			active: true
		},
		{ sessionId: 'b', userId: 'user-b', username: 'Alex', email: 'alex@example.com', active: false }
	];
</script>

<script lang="ts">
	import { expect } from 'storybook/test';
	let selectedSession = $state('None');
	let loggedOutSession = $state('None');
</script>

<Story
	name="Switches accounts and reports logout"
	args={{ accounts }}
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Alex alex@example.com' }));
		await expect(canvas.getByText('Selected session: b')).toBeInTheDocument();
		await userEvent.click(canvas.getByRole('button', { name: 'Logout Taylor' }));
		await expect(canvas.getByText('Logged out session: a')).toBeInTheDocument();
	}}
>
	{#snippet template(args)}
		<AccountModal
			{...args}
			onClose={() => {}}
			onSelectAccount={(sessionId) => (selectedSession = sessionId)}
			onLogoutAccount={(sessionId) => (loggedOutSession = sessionId)}
			onAddAccount={() => {}}
		/>
		<p aria-live="polite">Selected session: {selectedSession}</p>
		<p aria-live="polite">Logged out session: {loggedOutSession}</p>
	{/snippet}
</Story>
