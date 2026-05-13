	<script lang="ts">
	import type { AuthSessionResponse, AuthSessionSummary } from '@ez/auth';
	import { createSyncController } from '@ez/sync';
	import { onMount } from 'svelte';
	import { AppShell, Button, FloatingMenu, Icon, Modal, Navbar, OtpInput, TextInput } from '@ez/ui';
	import { auth, repeatApi } from '$lib/api';
	import CalendarDrawer from '$lib/components/CalendarDrawer.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import DateNavigator from '$lib/components/DateNavigator.svelte';
	import HabitCreateModal from '$lib/components/HabitCreateModal.svelte';
	import HabitList from '$lib/components/HabitList.svelte';
	import { createRepeatController, type RepeatViewModel, type ThemeMode } from '$lib';
	import { syncRepeatData } from '$lib/repeat/sync';
	import type { HabitProgress, ParsedHabitInput } from '$lib/repeat/types';

	type AppSyncStatus = 'offline' | 'syncing' | 'synced' | 'saved_locally' | 'error';

	const repeat = createRepeatController();

	let view: RepeatViewModel;
	$: view = $repeat;

	let addModalOpen = false;
	let drawerOpen = false;
	let editMode = false;
	let editHabitProgress: HabitProgress | null = null;
	let settingsMenuOpen = false;
	let confirmAction: { type: 'archive' | 'delete'; progress: HabitProgress } | null = null;
	let settingsControl: HTMLDivElement | null = null;
	let authUser: AuthSessionSummary | null = null;
	let authSessions: AuthSessionSummary[] = [];
	let accountModalOpen = false;
	let accountBusySessionId: string | null = null;
	let loginModalOpen = false;
	let loginStep: 'email' | 'otp' = 'email';
	let emailDraft = '';
	let otpDraft = '';
	let authBusy = false;
	let loginSubmitting = false;
	let otpVerifying = false;
	let otpShake = false;
	let resendCooldownRemaining = 0;
	let resendCooldownInterval: ReturnType<typeof setInterval> | null = null;
	let syncBusy = false;
	let appSyncStatus: AppSyncStatus = 'synced';
	let authMessage = '';
	let authChannel: BroadcastChannel | null = null;

	const tabId =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `tab-${Math.random().toString(36).slice(2, 10)}`;
	const AUTH_CHANNEL_NAME = 'auth';
	const EDIT_SYNC_DEBOUNCE_MS = 3000;
	const syncController = createSyncController({
		delayMs: EDIT_SYNC_DEBOUNCE_MS,
		runSync: executeSync
	});

	onMount(() => {
		void initializeApp();
		setupAuthChannel();
		const unsubscribeStorage = repeat.subscribeToExternalChanges();

		function handlePointerDown(event: PointerEvent) {
			if (!settingsMenuOpen) {
				return;
			}

			const target = event.target;
			if (
				target instanceof Node &&
				(settingsControl?.contains(target) ||
					(target instanceof Element && target.closest('.settings-control')))
			) {
				return;
			}

			settingsMenuOpen = false;
		}

		window.addEventListener('pointerdown', handlePointerDown);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			unsubscribeStorage();
			authChannel?.close();
			stopResendCooldown();
			syncController.cancel();
		};
	});

	$: applyTheme(view?.themeMode ?? 'light');
	$: syncStatusLabel = getSyncStatusLabel(appSyncStatus);

	async function initializeApp() {
		await repeat.load();
		await loadAuthSession();
	}

	function applyTheme(themeMode: ThemeMode) {
		if (typeof document === 'undefined') {
			return;
		}

		document.body.dataset.theme = themeMode;
	}

	async function createHabit(parsed: ParsedHabitInput) {
		await repeat.createHabit(parsed);
		addModalOpen = false;
		markSavedLocally();
		scheduleSync();
	}

	async function editHabit(parsed: ParsedHabitInput) {
		if (!editHabitProgress) {
			return;
		}

		await repeat.editHabit(editHabitProgress.habit.id, parsed);
		editHabitProgress = null;
		markSavedLocally();
		scheduleSync();
	}

	async function confirmSelectedAction() {
		if (!confirmAction) {
			return;
		}

		if (confirmAction.type === 'archive') {
			await repeat.archiveHabit(confirmAction.progress.habit.id);
		} else {
			await repeat.deleteHabit(confirmAction.progress.habit.id);
		}

		confirmAction = null;
		markSavedLocally();
		scheduleSync();
	}

	async function toggleTheme() {
		await repeat.setThemeMode(view.themeMode === 'dark' ? 'light' : 'dark');
		settingsMenuOpen = false;
	}

	async function addCompletion(progress: HabitProgress) {
		await repeat.addCompletion(progress);
		markSavedLocally();
		scheduleSync();
	}

	async function undoCompletion(progress: HabitProgress) {
		await repeat.undoCompletion(progress);
		markSavedLocally();
		scheduleSync();
	}

	async function loadAuthSession() {
		if (!auth) {
			return;
		}

		authBusy = true;
		authMessage = '';
		try {
			const session = await auth.getSession();
			authSessions = session.sessions;
			await applyAuthResponse(session, { broadcast: false });
		} catch (error) {
			authMessage = getErrorMessage(error, 'Unable to load session.');
		} finally {
			authBusy = false;
		}
	}

	function closeLoginModal() {
		if (loginSubmitting || otpVerifying) return;
		loginModalOpen = false;
		loginStep = 'email';
		otpDraft = '';
		stopResendCooldown();
		authMessage = '';
	}

	function closeAccountModal() {
		if (authBusy || accountBusySessionId) return;
		accountModalOpen = false;
	}

	async function openLoginFlow() {
		accountModalOpen = false;
		loginModalOpen = true;
		loginStep = 'email';
		otpDraft = '';
		authMessage = '';
	}

	async function openLoginOrAccountList() {
		if (!auth) return;
		authBusy = true;
		authMessage = '';
		let openedModal = false;
		try {
			const nextSession = await auth.getSession();
			authSessions = nextSession.sessions;
			if (authSessions.length > 0) {
				accountModalOpen = true;
				loginModalOpen = false;
				openedModal = true;
			} else {
				await openLoginFlow();
				openedModal = true;
			}
		} catch (error) {
			authMessage = getErrorMessage(error, 'Unable to load accounts.');
		} finally {
			authBusy = false;
			if (openedModal) {
				settingsMenuOpen = false;
			}
		}
	}

	async function switchAccount() {
		if (!auth || authBusy || syncBusy) return;
		authBusy = true;
		authMessage = '';
		try {
			const nextSession = await auth.getSession();
			authSessions = nextSession.sessions;
			if (authSessions.length >= 2) {
				accountModalOpen = true;
				loginModalOpen = false;
			} else {
				await openLoginFlow();
			}
		} catch (error) {
			authMessage = getErrorMessage(error, 'Unable to load accounts.');
		} finally {
			authBusy = false;
			settingsMenuOpen = false;
		}
	}

	async function submitLogin() {
		if (!auth) return;
		const email = emailDraft.trim();
		if (!email) {
			authMessage = 'Enter an email address.';
			return;
		}

		loginSubmitting = true;
		authMessage = '';
		try {
			await auth.login(email);
			loginStep = 'otp';
			otpDraft = '';
			startResendCooldown();
		} catch (error) {
			authMessage = getErrorMessage(error, 'Unable to send login code.');
		} finally {
			loginSubmitting = false;
		}
	}

	async function verifyOtpCode(code: string) {
		if (!auth || otpVerifying || code.length !== 8) return;

		otpVerifying = true;
		authMessage = '';
		try {
			const session = await auth.verify(emailDraft.trim(), code);
			loginModalOpen = false;
			accountModalOpen = false;
			loginStep = 'email';
			otpDraft = '';
			stopResendCooldown();
			await applyAuthResponse(session);
			requestImmediateSync();
		} catch (error) {
			otpDraft = '';
			authMessage = getErrorMessage(error, 'Unable to verify code.');
			triggerOtpShake();
		} finally {
			otpVerifying = false;
		}
	}

	async function resendOtpCode() {
		if (!auth || resendCooldownRemaining > 0 || loginSubmitting || otpVerifying) return;

		loginSubmitting = true;
		authMessage = '';
		try {
			await auth.login(emailDraft.trim());
			startResendCooldown();
			authMessage = 'A new code was sent.';
		} catch (error) {
			authMessage = getErrorMessage(error, 'Unable to resend code.');
		} finally {
			loginSubmitting = false;
		}
	}

	function startResendCooldown() {
		stopResendCooldown();
		resendCooldownRemaining = 30;
		resendCooldownInterval = setInterval(() => {
			resendCooldownRemaining = Math.max(0, resendCooldownRemaining - 1);
			if (resendCooldownRemaining === 0) {
				stopResendCooldown();
			}
		}, 1000);
	}

	function stopResendCooldown() {
		if (resendCooldownInterval) {
			clearInterval(resendCooldownInterval);
			resendCooldownInterval = null;
		}
	}

	function triggerOtpShake() {
		otpShake = false;
		requestAnimationFrame(() => {
			otpShake = true;
			setTimeout(() => {
				otpShake = false;
			}, 300);
		});
	}

	async function logoutCurrentAccount() {
		if (!authUser || authBusy || syncBusy) return;
		await logoutAccountSession(authUser.sessionId, authUser.userId);
		settingsMenuOpen = false;
	}

	async function logoutAccountSession(sessionId: string, userId: string) {
		if (!auth || authBusy || accountBusySessionId) return;

		const wasActiveAccount = authUser?.userId === userId;
		authBusy = wasActiveAccount;
		accountBusySessionId = sessionId;
		authMessage = '';
		try {
			const nextSession = await auth.logout({ sessionId });
			authSessions = nextSession.sessions;
			if (wasActiveAccount || nextSession.activeSession?.userId !== authUser?.userId) {
				await applyAuthResponse(nextSession);
			}
		} catch (error) {
			authMessage = getErrorMessage(error, 'Unable to logout.');
		} finally {
			authBusy = false;
			accountBusySessionId = null;
			if (authSessions.length === 0) {
				accountModalOpen = false;
			}
		}
	}

	async function selectAccountSession(nextSessionId: string) {
		if (!auth || authBusy || syncBusy || accountBusySessionId) return;

		const selectedSession = authSessions.find((entry) => entry.sessionId === nextSessionId);
		if (selectedSession?.active) {
			accountModalOpen = false;
			return;
		}

		authBusy = true;
		accountBusySessionId = nextSessionId;
		authMessage = '';
		try {
			await applyAuthResponse(await auth.switchSession(nextSessionId));
			accountModalOpen = false;
			requestImmediateSync();
		} catch (error) {
			authMessage = getErrorMessage(error, 'Unable to switch accounts.');
		} finally {
			authBusy = false;
			accountBusySessionId = null;
		}
	}

	async function applyAuthResponse(
		nextSession: AuthSessionResponse,
		options: { broadcast?: boolean } = {}
	) {
		authSessions = nextSession.sessions;
		authUser = nextSession.activeSession;
		authMessage = '';
		await repeat.setUserId(authUser?.userId ?? null);
		appSyncStatus = getSettledAppSyncStatus();
		if (options.broadcast !== false) {
			broadcastAuthSessionChanged(authUser?.userId ?? null);
		}
	}

	function setupAuthChannel() {
		if (typeof BroadcastChannel === 'undefined') return;
		authChannel?.close();
		authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
		authChannel.onmessage = (event) => {
			const message = event.data as
				| { type?: unknown; sourceTabId?: unknown; userId?: unknown }
				| null;
			if (!message || message.type !== 'auth-session-updated' || message.sourceTabId === tabId) {
				return;
			}
			void refreshAuthFromBroadcast();
		};
	}

	function broadcastAuthSessionChanged(userId: string | null) {
		authChannel?.postMessage({
			type: 'auth-session-updated',
			sourceTabId: tabId,
			userId
		});
	}

	async function refreshAuthFromBroadcast() {
		if (!auth) return;
		try {
			const nextSession = await auth.getSession();
			if (nextSession.activeSession?.userId === authUser?.userId) {
				authSessions = nextSession.sessions;
				return;
			}
			await applyAuthResponse(nextSession, { broadcast: false });
			requestImmediateSync();
		} catch (error) {
			console.error('Failed to refresh auth session from broadcast:', error);
		}
	}

	function getAccountInitial(account: AuthSessionSummary) {
		return account.username.trim().slice(0, 1).toUpperCase() || '?';
	}

	function scheduleSync() {
		if (authUser) {
			syncController.scheduleDebounced();
		}
	}

	function requestImmediateSync(options: { showSuccessNotice?: boolean } = {}) {
		if (!authUser) return;
		syncController.requestImmediate({ showSuccessNotice: options.showSuccessNotice ?? false });
	}

	async function executeSync(options: { showSuccessNotice: boolean }) {
		if (!repeatApi || !authUser) {
			authMessage = auth ? 'Login required.' : 'Sync is not configured.';
			return;
		}

		syncBusy = true;
		appSyncStatus = isBrowserOnline() ? 'syncing' : 'offline';
		authMessage = '';
		try {
			await syncRepeatData(repeatApi, authUser.userId);
			await repeat.refresh();
			appSyncStatus = getSettledAppSyncStatus();
		} catch (error) {
			appSyncStatus = isBrowserOnline() ? 'error' : 'offline';
			authMessage = getErrorMessage(error, 'Unable to sync habits.');
		} finally {
			syncBusy = false;
		}
	}

	function markSavedLocally() {
		if (!authUser) {
			return;
		}

		appSyncStatus = getSettledAppSyncStatus(true);
	}

	function getSettledAppSyncStatus(hasUnsyncedChanges = hasUnsyncedRepeatData()) {
		if (!isBrowserOnline()) {
			return 'offline';
		}

		return hasUnsyncedChanges ? 'saved_locally' : 'synced';
	}

	function hasUnsyncedRepeatData() {
		if (!view?.loaded) {
			return false;
		}

		return [...view.snapshot.habits, ...view.snapshot.completions].some(
			(item) => item.lastSyncedAt === null || item.updatedAt > item.lastSyncedAt
		);
	}

	function isBrowserOnline() {
		return typeof navigator === 'undefined' ? true : navigator.onLine;
	}

	function getSyncStatusLabel(status: AppSyncStatus) {
		switch (status) {
			case 'offline':
				return 'Offline';
			case 'syncing':
				return 'Syncing…';
			case 'synced':
				return 'Synced';
			case 'saved_locally':
				return 'Saved locally';
			case 'error':
				return 'Sync error';
		}
	}

	function handleWindowOnline() {
		appSyncStatus = getSettledAppSyncStatus();
		requestImmediateSync();
	}

	function handleWindowOffline() {
		appSyncStatus = 'offline';
	}

	function getErrorMessage(error: unknown, fallback: string) {
		return error instanceof Error && error.message ? error.message : fallback;
	}
</script>

<svelte:head>
	<title>ez-repeat</title>
</svelte:head>

<svelte:window on:online={handleWindowOnline} on:offline={handleWindowOffline} />

<AppShell>
	{#if view?.loaded}
		<button
			class="drawer-toggle"
			type="button"
			aria-label={drawerOpen ? 'Close calendar' : 'Open calendar'}
			aria-expanded={drawerOpen}
			on:click={() => (drawerOpen = !drawerOpen)}
		>
			<Icon name={drawerOpen ? 'x-mark' : 'calendar-days'} />
		</button>
	{/if}

	<Navbar visible={view?.loaded ?? false}>
		{#if view?.loaded && !view.isToday && !drawerOpen}
			<div class="nav-left">
				<Button size="sm" on:click={repeat.selectToday}>today</Button>
			</div>
		{/if}
		<div class="nav-actions">
			<Button size="icon" ariaLabel="Edit habits" on:click={() => (editMode = !editMode)}>
				<Icon name="pencil-square" />
			</Button>
			<Button size="icon" ariaLabel="Add habit" on:click={() => (addModalOpen = true)}>
				<Icon name="plus" />
			</Button>
			<div class="settings-control" bind:this={settingsControl}>
				<Button
					size="icon"
					ariaLabel="Open settings"
					on:click={() => (settingsMenuOpen = !settingsMenuOpen)}
				>
					<Icon name="ellipsis-horizontal" />
				</Button>
				{#if settingsMenuOpen}
					<FloatingMenu label="Settings" verticalOffset="var(--space-2)">
						<button type="button" on:click={toggleTheme}>
							{view.themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
						</button>
						{#if authUser}
							<button
								type="button"
								disabled={syncBusy || appSyncStatus === 'offline'}
								on:click={() => requestImmediateSync()}
							>
								{syncStatusLabel}
							</button>
							<button type="button" disabled={authBusy || syncBusy} on:click={switchAccount}>
								Switch Account
							</button>
							<button type="button" disabled={authBusy || syncBusy} on:click={logoutCurrentAccount}>
								Logout
							</button>
							<div class="menu-stat">{authUser.email ?? authUser.userId}</div>
						{:else}
							<button type="button" disabled={!auth || authBusy} on:click={openLoginOrAccountList}>
								Login
							</button>
						{/if}
						{#if authMessage && !loginModalOpen}
							<div class="menu-stat">{authMessage}</div>
						{/if}
					</FloatingMenu>
				{/if}
			</div>
		</div>
	</Navbar>

	{#if drawerOpen}
		<button
			class="scrim"
			type="button"
			aria-label="Close calendar"
			on:click={() => (drawerOpen = false)}
		></button>
	{/if}

	{#if view?.loaded}
		<CalendarDrawer
			open={drawerOpen}
			habits={view.snapshot.habits}
			completions={view.snapshot.completions}
			todayDate={view.todayDate}
			selectedDate={view.selectedDate}
			onSelectDate={(dateKey) => {
				repeat.selectDate(dateKey);
				drawerOpen = false;
			}}
		/>
	{/if}

	<main class="workspace">
		{#if view?.loaded}
			<DateNavigator
				selectedDate={view.selectedDate}
				todayDate={view.todayDate}
				onMove={repeat.moveDate}
			/>

			<HabitList
				progress={view.progress}
				{editMode}
				onComplete={addCompletion}
				onUndo={undoCompletion}
				onEdit={(progress) => (editHabitProgress = progress)}
				onArchive={(progress) => (confirmAction = { type: 'archive', progress })}
				onDelete={(progress) => (confirmAction = { type: 'delete', progress })}
			/>
		{/if}
	</main>

	{#if addModalOpen}
		<HabitCreateModal onCancel={() => (addModalOpen = false)} onCreate={createHabit} />
	{/if}

	{#if loginModalOpen}
		<Modal title="Login" onClose={closeLoginModal}>
			{#if loginStep === 'email'}
				<label class="auth-field">
					<span>Email</span>
					<TextInput
						bind:value={emailDraft}
						type="email"
						placeholder="you@example.com"
						autocomplete="email"
						on:keydown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault();
								void submitLogin();
							}
						}}
					/>
				</label>
			{:else}
				<div class="auth-field">
					<span>Code sent to {emailDraft.trim()}</span>
					<OtpInput
						value={otpDraft}
						disabled={otpVerifying}
						shake={otpShake}
						on:change={(event) => {
							otpDraft = event.detail.value;
						}}
						on:complete={(event) => {
							void verifyOtpCode(event.detail.value);
						}}
					/>
				</div>
			{/if}
			{#if authMessage}
				<p class="auth-message">{authMessage}</p>
			{/if}
			<svelte:fragment slot="actions">
				{#if loginStep === 'otp'}
					<Button
						disabled={resendCooldownRemaining > 0 || loginSubmitting || otpVerifying}
						on:click={resendOtpCode}
					>
						{#if resendCooldownRemaining > 0}
							Resend code ({resendCooldownRemaining}s)
						{:else}
							Resend code
						{/if}
					</Button>
					<Button
						disabled={otpVerifying}
						on:click={() => {
							loginStep = 'email';
							otpDraft = '';
							authMessage = '';
						}}
					>
						Back
					</Button>
					<div class="auth-status" aria-live="polite">
						{otpVerifying ? 'Verifying…' : ''}
					</div>
				{:else}
					<Button on:click={closeLoginModal}>Cancel</Button>
					<Button variant="primary" disabled={loginSubmitting} on:click={submitLogin}>
						{loginSubmitting ? 'Sending…' : 'Send Email'}
					</Button>
				{/if}
			</svelte:fragment>
		</Modal>
	{/if}

	{#if accountModalOpen}
		<Modal title="Accounts" onClose={closeAccountModal}>
			<div class="account-list">
				{#each authSessions as account (account.sessionId)}
					<div class:active={account.active} class="account-row">
						<button
							class="account-select"
							type="button"
							disabled={authBusy || syncBusy || accountBusySessionId !== null}
							on:click={() => selectAccountSession(account.sessionId)}
						>
							<span class="account-avatar" aria-hidden="true">
								{getAccountInitial(account)}
							</span>
							<span class="account-copy">
								<span class="account-name">{account.username}</span>
								{#if account.email && account.email !== account.username}
									<span class="account-meta">{account.email}</span>
								{/if}
							</span>
						</button>
						<button
							class="account-remove"
							type="button"
							aria-label={`Logout ${account.username}`}
							disabled={authBusy || syncBusy || accountBusySessionId !== null}
							on:click={() => logoutAccountSession(account.sessionId, account.userId)}
						>
							x
						</button>
					</div>
				{/each}
			</div>
			{#if authMessage}
				<p class="auth-message">{authMessage}</p>
			{/if}
			<svelte:fragment slot="actions">
				<div class="account-actions">
					<Button size="sm" on:click={openLoginFlow}>Sign into another account</Button>
				</div>
			</svelte:fragment>
		</Modal>
	{/if}

	{#if editHabitProgress}
		<HabitCreateModal
			title="Edit Habit"
			submitLabel="Save"
			initialValue={editHabitProgress.habit.title}
			initialTargetCount={editHabitProgress.habit.targetCount}
			initialRecurrence={editHabitProgress.habit.recurrence}
			disclaimer="This will archive the old habit and create a new habit in its place."
			onCancel={() => (editHabitProgress = null)}
			onCreate={editHabit}
		/>
	{/if}

	{#if confirmAction}
		{#if confirmAction.type === 'archive'}
			<ConfirmModal
				title="Archive habit"
				message="Archive this habit from this date forward. Earlier dates and completions will stay visible."
				actionLabel="Archive"
				onCancel={() => (confirmAction = null)}
				onConfirm={confirmSelectedAction}
			/>
		{:else}
			<ConfirmModal
				title="Delete habit"
				message="Delete this habit and all of its completions from every date."
				actionLabel="Delete"
				danger
				onCancel={() => (confirmAction = null)}
				onConfirm={confirmSelectedAction}
			/>
		{/if}
	{/if}
</AppShell>

<style>
	.drawer-toggle {
		position: absolute;
		top: max(var(--space-3), env(safe-area-inset-top));
		left: max(var(--space-3), env(safe-area-inset-left));
		z-index: 28;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-1);
		background: transparent;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: var(--theme-transition);
	}

	.drawer-toggle:hover,
	.drawer-toggle:focus-visible {
		background-color: var(--color-hover);
		outline: none;
	}

	.drawer-toggle :global(svg) {
		width: 1.1rem;
		height: 1.1rem;
		color: var(--color-fg);
		fill: currentColor;
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 10;
		border: 0;
		background-color: var(--color-scrim);
		transition: var(--theme-transition);
	}

	.nav-left,
	.nav-actions {
		position: absolute;
		top: 0;
		display: flex;
		align-items: center;
	}

	.nav-left {
		left: 2.5rem;
	}

	.nav-actions {
		right: 0;
		gap: var(--space-0);
	}

	.settings-control {
		position: relative;
	}

	.nav-left :global(button),
	.nav-actions :global(button) {
		border-radius: var(--radius-1);
		font-family: var(--font-family-mono);
		transition: var(--theme-transition);
	}

	.nav-left :global(button) {
		min-height: 2rem;
		padding: var(--space-2) var(--space-3);
		font-size: var(--font-size-sm);
		letter-spacing: var(--letter-spacing-count);
	}

	.nav-actions :global(svg) {
		width: 1.1rem;
		height: 1.1rem;
		color: var(--color-fg);
		fill: currentColor;
	}

	.auth-field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		font-size: var(--font-size-2xs);
	}

	.auth-message {
		margin: var(--space-2) 0 0;
		font-size: var(--font-size-md);
		color: var(--color-muted);
	}

	.auth-status {
		min-width: 4.5rem;
		text-align: right;
		font: inherit;
		font-size: var(--font-size-xs);
		color: var(--color-muted);
	}

	.account-list {
		max-height: min(18rem, 55vh);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-right: var(--space-1);
	}

	.account-row {
		display: grid;
		grid-template-columns: 1fr 2rem;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background-color: var(--color-bg);
		transition: var(--theme-transition);
	}

	.account-row.active {
		border-color: var(--color-fg);
		background-color: var(--color-hover);
	}

	.account-select,
	.account-remove {
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.account-select {
		min-width: 0;
		display: grid;
		grid-template-columns: 2rem 1fr;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		text-align: left;
	}

	.account-avatar {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-round);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-panel);
		border: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
		color: var(--color-fg);
		transition: var(--theme-transition);
	}

	.account-copy {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.account-name,
	.account-meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.account-name {
		font-size: var(--font-size-sm);
		color: var(--color-fg);
	}

	.account-meta {
		font-size: var(--font-size-xs);
		color: var(--color-muted);
	}

	.account-actions {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.account-remove {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-round);
		color: var(--color-muted);
	}

	.account-select:disabled,
	.account-remove:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.workspace {
		width: 100%;
		max-width: 680px;
		min-height: 100vh;
		box-sizing: border-box;
		margin: 0 auto;
		padding: calc(var(--space-8) + env(safe-area-inset-top)) var(--space-5) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		font-family: var(--font-family-mono);
	}

	@media (max-width: 560px) {
		.workspace {
			padding: calc(var(--space-8) + var(--space-2) + env(safe-area-inset-top)) var(--space-5)
				var(--space-6);
			gap: var(--space-4);
		}
	}
</style>
