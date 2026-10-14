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

<Story name="Multiple accounts" args={{ accounts }}>
	{#snippet template(args)}<AccountModal
			{...args}
			onClose={() => {}}
			onSelectAccount={() => {}}
			onLogoutAccount={() => {}}
			onAddAccount={() => {}}
		/>{/snippet}
</Story>
