<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { SvelteSet } from 'svelte/reactivity';
	import { expect } from 'storybook/test';
	import AccountDialogs from './AccountDialogs.svelte';
	import FloatingMenu from './FloatingMenu.svelte';

	function createController(
		overrides: Record<string, unknown>,
		lookupResult: 'login' | 'accounts' = 'login'
	) {
		const subscribers = new SvelteSet<(value: typeof state) => void>();
		let state = {
			sessions: [
				{
					sessionId: 'session-a',
					userId: 'user-a',
					email: 'taylor@example.com',
					username: 'Taylor',
					active: true
				}
			],
			authBusy: false,
			accountBusySessionId: null,
			authMessage: '',
			loginModalOpen: false,
			accountModalOpen: false,
			loginLookup: 'idle',
			loginStep: 'email',
			emailDraft: 'taylor@example.com',
			otpDraft: '',
			loginSubmitting: false,
			otpVerifying: false,
			otpShake: false,
			resendCooldownRemaining: 0,
			oauthBusyProvider: null,
			connectedAccountsOpen: false,
			identities: [],
			identitiesLoading: false,
			identityBusyId: null,
			...overrides
		};

		return {
			subscribe(run: (value: typeof state) => void) {
				subscribers.add(run);
				run(state);
				return () => subscribers.delete(run);
			},
			async openLoginOrAccountList() {
				state = {
					...state,
					loginModalOpen: true,
					accountModalOpen: false,
					loginLookup: 'loading',
					authBusy: true
				};
				for (const subscriber of subscribers) subscriber(state);
				await new Promise((resolve) => window.setTimeout(resolve, 300));
				state = {
					...state,
					loginLookup: 'idle',
					authBusy: false,
					loginModalOpen: lookupResult === 'login',
					accountModalOpen: lookupResult === 'accounts'
				};
				for (const subscriber of subscribers) subscriber(state);
			},
			openLoginFlow() {},
			closeLoginModal() {
				state = { ...state, loginModalOpen: false, loginLookup: 'idle', authBusy: false };
				for (const subscriber of subscribers) subscriber(state);
			},
			closeAccountModal() {
				state = { ...state, accountModalOpen: false };
				for (const subscriber of subscribers) subscriber(state);
			},
			submitLogin: async () => {},
			verifyOtpCode: async () => {},
			resendOtpCode: async () => {},
			backToEmail() {},
			startOAuthSignIn() {},
			openConnectedAccounts: async () => {},
			closeConnectedAccounts() {},
			connectOAuthProvider() {},
			unlinkOAuthIdentity: async () => {},
			selectAccountSession: async () => {},
			useAnonymousAccount: async () => {},
			logoutAccountSession: async () => {}
		};
	}

	const { Story } = defineMeta({
		title: 'Components/Patterns/Account Dialogs',
		component: AccountDialogs
	});
	const loginController = createController({});
	const accountLookupController = createController({}, 'accounts');
</script>

<Story name="Login dialog" args={{ controller: createController({ loginModalOpen: true }) }}>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story name="Account switcher" args={{ controller: createController({ accountModalOpen: true }) }}>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story
	name="Already signed into this account"
	args={{
		controller: createController({
			accountModalOpen: true,
			authMessage: 'Already signed into this account.'
		})
	}}
>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story
	name="Profile and login methods dialog"
	args={{
		controller: createController({
			connectedAccountsOpen: true,
			identities: [
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
			]
		})
	}}
>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story
	name="Session lookup loading state"
	args={{
		controller: createController({ loginModalOpen: true, loginLookup: 'loading', authBusy: true })
	}}
>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story
	name="Session lookup loading"
	args={{
		controller: createController({ loginModalOpen: true, loginLookup: 'loading', authBusy: true })
	}}
	play={async ({ canvas, userEvent }) => {
		const dialog = canvas.getByRole('dialog', { name: 'Loading account' });
		await expect(canvas.getByRole('status', { name: 'Loading account' })).toBeVisible();
		await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
		await expect(dialog).not.toBeInTheDocument();
	}}
>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story
	name="Clicking away cancels session lookup"
	args={{
		controller: createController({ loginModalOpen: true, loginLookup: 'loading', authBusy: true })
	}}
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Close dialog' }));
		await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
	}}
>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story
	name="Session lookup populates saved accounts"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('menuitem', { name: 'Login' }));
		const dialog = canvas.getByRole('dialog', { name: 'Loading account' });
		const accountDialog = await canvas.findByRole('dialog', { name: 'Accounts' });
		await expect(dialog).toBe(accountDialog);
		await expect(canvas.getByText('Taylor')).toBeVisible();
	}}
>
	{#snippet template()}
		<div class="menu-anchor">
			<FloatingMenu label="Account menu">
				<button
					type="button"
					role="menuitem"
					onclick={() => void accountLookupController.openLoginOrAccountList()}
				>
					Login
				</button>
			</FloatingMenu>
		</div>
		<AccountDialogs controller={accountLookupController} />
	{/snippet}
</Story>

<Story
	name="Session lookup failed state"
	args={{
		controller: createController({
			loginModalOpen: true,
			loginLookup: 'failed',
			authMessage: 'Unable to reach the account service.'
		})
	}}
>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story
	name="Session lookup failure and retry"
	args={{
		controller: createController({
			loginModalOpen: true,
			loginLookup: 'failed',
			authMessage: 'Unable to reach the account service.'
		})
	}}
	play={async ({ canvas, userEvent }) => {
		await expect(canvas.getByRole('alert')).toHaveTextContent(
			'Unable to reach the account service.'
		);
		await userEvent.click(canvas.getByRole('button', { name: 'Retry loading account' }));
		await expect(canvas.getByRole('status', { name: 'Loading account' })).toBeVisible();
	}}
>
	{#snippet template(args)}<AccountDialogs {...args} />{/snippet}
</Story>

<Story
	name="Login action opens the dialog"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('menuitem', { name: 'Login' }));
		const dialog = canvas.getByRole('dialog', { name: 'Loading account' });
		await expect(canvas.getByRole('status', { name: 'Loading account' })).toBeVisible();
		const loginDialog = await canvas.findByRole('dialog', { name: 'Login' });
		await expect(dialog).toBe(loginDialog);
	}}
>
	{#snippet template()}
		<div class="menu-anchor">
			<FloatingMenu label="Account menu">
				<button
					type="button"
					role="menuitem"
					onclick={() => void loginController.openLoginOrAccountList()}
				>
					Login
				</button>
			</FloatingMenu>
		</div>
		<AccountDialogs controller={loginController} />
	{/snippet}
</Story>

<style>
	.menu-anchor {
		position: relative;
		min-height: 12rem;
		min-width: 16rem;
		color: var(--color-fg);
	}
</style>
