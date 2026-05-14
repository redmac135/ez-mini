<script lang="ts">
	import { createAccountDataController } from '@ez/account';
	import { createSyncController, getSyncStatusLabel, type AppSyncStatus } from '@ez/sync';
	import { onMount } from 'svelte';
	import {
		AccountModal,
		AppShell,
		Button,
		ConfirmModal,
		FloatingMenu,
		Icon,
		LoginModal,
		Navbar,
		ToastStack,
		createToastController,
		Workspace
	} from '@ez/ui';
	import { auth, repeatApi } from '$lib/api';
	import {
		APP_UPDATED_NOTICE,
		APP_UPDATED_NOTICE_EVENT,
		consumeQueuedAppUpdatedNotice
	} from '$lib/pwa-update-notice';
	import CalendarDrawer from '$lib/components/CalendarDrawer.svelte';
	import DateNavigator from '$lib/components/DateNavigator.svelte';
	import HabitCreateModal from '$lib/components/HabitCreateModal.svelte';
	import HabitList from '$lib/components/HabitList.svelte';
	import { createRepeatController, type RepeatViewModel, type ThemeMode } from '$lib';
	import { getRepeatSyncNotice, syncRepeatData } from '$lib/repeat/sync';
	import type { HabitProgress, ParsedHabitInput } from '$lib/repeat/types';

	const repeat = createRepeatController();
	const toasts = createToastController();
	const account = createAccountDataController<null>({
		authClient: auth,
		adapter: {
			async loadAnonymous() {
				await repeat.setUserId(null);
				return null;
			},
			async loadAccount(user) {
				await repeat.setUserId(user.userId);
				return null;
			},
			onLoaded({ user }) {
				appSyncStatus = getSettledAppSyncStatus();
				if (user) {
					requestImmediateSync();
				}
			}
		},
		getErrorMessage,
		onNotice(message) {
			showStatusNotice(message);
		}
	});

	let view: RepeatViewModel;
	let accountState = account.getState();
	$: view = $repeat;
	$: accountState = $account;

	let addModalOpen = false;
	let drawerOpen = false;
	let editMode = false;
	let editHabitProgress: HabitProgress | null = null;
	let settingsMenuOpen = false;
	let confirmAction: { type: 'archive' | 'delete'; progress: HabitProgress } | null = null;
	let settingsControl: HTMLDivElement | null = null;
	let syncBusy = false;
	let appSyncStatus: AppSyncStatus = 'synced';
	let toastNotices = $toasts;
	$: toastNotices = $toasts;

	const EDIT_SYNC_DEBOUNCE_MS = 3000;
	const syncController = createSyncController({
		delayMs: EDIT_SYNC_DEBOUNCE_MS,
		runSync: executeSync
	});

	onMount(() => {
		void initializeApp();
		showQueuedAppUpdatedNotice();
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
		window.addEventListener(APP_UPDATED_NOTICE_EVENT, handleAppUpdatedNotice);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener(APP_UPDATED_NOTICE_EVENT, handleAppUpdatedNotice);
			unsubscribeStorage();
			account.destroy();
			syncController.cancel();
			toasts.clear();
		};
	});

	$: applyTheme(view?.themeMode ?? 'light');
	$: syncStatusLabel = getSyncStatusLabel(appSyncStatus);

	async function initializeApp() {
		await account.initialize();
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

	async function logoutCurrentAccount() {
		if (!accountState.user || accountState.authBusy || syncBusy) return;
		await account.logoutCurrentAccount();
		settingsMenuOpen = false;
	}

	function scheduleSync() {
		if (accountState.user) {
			syncController.scheduleDebounced();
		}
	}

	function requestImmediateSync(options: { showSuccessNotice?: boolean } = {}) {
		if (!accountState.user) return;
		syncController.requestImmediate({ showSuccessNotice: options.showSuccessNotice ?? false });
	}

	async function executeSync(options: { showSuccessNotice: boolean }) {
		if (!repeatApi || !accountState.user) {
			return;
		}

		syncBusy = true;
		appSyncStatus = isBrowserOnline() ? 'syncing' : 'offline';
		try {
			const result = await syncRepeatData(repeatApi, accountState.user.userId);
			await repeat.refresh();
			const notice = getRepeatSyncNotice(result, options);
			if (notice) {
				showStatusNotice(notice);
			}
			appSyncStatus = getSettledAppSyncStatus();
		} catch (error) {
			if (await account.handleAuthFailure(error)) {
				appSyncStatus = getSettledAppSyncStatus();
				return;
			}
			appSyncStatus = isBrowserOnline() ? 'error' : 'offline';
		} finally {
			syncBusy = false;
		}
	}

	function markSavedLocally() {
		if (!accountState.user) {
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

	function handleWindowOnline() {
		appSyncStatus = getSettledAppSyncStatus();
		requestImmediateSync();
	}

	function handleWindowOffline() {
		appSyncStatus = 'offline';
	}

	function showStatusNotice(message: string) {
		toasts.show(message);
	}

	function showQueuedAppUpdatedNotice() {
		if (typeof window === 'undefined') {
			return;
		}

		try {
			const message = consumeQueuedAppUpdatedNotice();
			if (message) {
				showStatusNotice(message);
			}
		} catch (error) {
			void error;
		}
	}

	function handleAppUpdatedNotice() {
		showQueuedAppUpdatedNotice();
		if (toastNotices.length === 0) {
			showStatusNotice(APP_UPDATED_NOTICE);
		}
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
	{#if view?.loaded && !drawerOpen}
		<button
			class="drawer-toggle"
			type="button"
			aria-label="Open calendar"
			aria-expanded={drawerOpen}
			on:click={() => (drawerOpen = !drawerOpen)}
		>
			<Icon name="calendar-days" />
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
						{#if accountState.user}
							<button
								type="button"
								disabled={syncBusy || appSyncStatus === 'offline'}
								on:click={() => requestImmediateSync()}
							>
								{syncStatusLabel}
							</button>
							<button
								type="button"
								disabled={accountState.authBusy || syncBusy}
								on:click={account.openLoginOrAccountList}
							>
								Switch Account
							</button>
							<button
								type="button"
								disabled={accountState.authBusy || syncBusy}
								on:click={logoutCurrentAccount}
							>
								Logout
							</button>
							<div class="menu-stat">{accountState.user.email ?? accountState.user.userId}</div>
						{:else}
							<button
								type="button"
								disabled={!auth || accountState.authBusy}
								on:click={account.openLoginOrAccountList}
							>
								Login
							</button>
						{/if}
						{#if accountState.authMessage && !accountState.loginModalOpen}
							<div class="menu-stat">{accountState.authMessage}</div>
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
			onClose={() => (drawerOpen = false)}
			onSelectDate={(dateKey) => {
				repeat.selectDate(dateKey);
				drawerOpen = false;
			}}
		/>
	{/if}

	<Workspace>
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
	</Workspace>

	{#if addModalOpen}
		<HabitCreateModal onCancel={() => (addModalOpen = false)} onCreate={createHabit} />
	{/if}

	{#if accountState.loginModalOpen}
		<LoginModal
			step={accountState.loginStep}
			email={accountState.emailDraft}
			otp={accountState.otpDraft}
			message={accountState.authMessage}
			loginSubmitting={accountState.loginSubmitting}
			otpVerifying={accountState.otpVerifying}
			otpShake={accountState.otpShake}
			resendCooldownRemaining={accountState.resendCooldownRemaining}
			onClose={account.closeLoginModal}
			onSubmitEmail={(email) => void account.submitLogin(email)}
			onVerifyOtp={(code) => void account.verifyOtpCode(code)}
			onResendOtp={account.resendOtpCode}
			onBackToEmail={account.backToEmail}
		/>
	{/if}

	{#if accountState.accountModalOpen}
		<AccountModal
			accounts={accountState.sessions}
			message={accountState.authMessage}
			busy={accountState.authBusy}
			{syncBusy}
			busySessionId={accountState.accountBusySessionId}
			onClose={account.closeAccountModal}
			onSelectAccount={(sessionId) => void account.selectAccountSession(sessionId)}
			onLogoutAccount={(sessionId, userId) => void account.logoutAccountSession(sessionId, userId)}
			onAddAccount={account.openLoginFlow}
		/>
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

	<ToastStack toasts={toastNotices} onDismiss={toasts.dismiss} />
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
</style>
