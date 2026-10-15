<script lang="ts">
	import { createAccountDataController } from '@ez/account';
	import { createSyncController, getSyncStatusLabel, type AppSyncStatus } from '@ez/sync';
	import { onMount } from 'svelte';
	import { Editor, type EditorState } from '@ez/editor';
	import {
		AccountDialogs,
		AccountLoading,
		AppShell,
		Button,
		ConfirmModal,
		FloatingMenu,
		Icon,
		Modal,
		Navbar,
		Workspace
	} from '@ez/ui';
	import { auth, journeyApi } from '$lib/api';
	import JourneyEntryEditor from '../lib/JourneyEntryEditor.svelte';
	import JourneyTimeline from '../lib/JourneyTimeline.svelte';
	import {
		animateBounds,
		clearFixedBounds,
		readBounds,
		setFixedBounds,
		type ElementBounds,
		type JourneyEntry,
		type StoredJourneyEntry
	} from '../lib/journey';
	import { JourneyStorage, type EntryCursor, type EntryPage } from '../lib/journey/storage';
	import { seedJourneyDemoData } from '../lib/journey/demo-data';
	import { syncJourneyEntries } from '../lib/journey/sync';

	const EMPTY_STATE: EditorState = { text: '', selectionStart: 0, selectionEnd: 0 };
	const VISIBLE_EDITOR_LINES = 3;
	const syncController = createSyncController({ delayMs: 2500, runSync: executeSync });
	type LoadedJourneyPage = EntryPage & { promptAnonymousImport?: boolean };
	const account = createAccountDataController<LoadedJourneyPage>({
		authClient: auth,
		adapter: {
			loadAnonymous: () => JourneyStorage.loadPage(null, null),
			async loadAccount(user) {
				const [page, anonymousEntries, alreadyPrompted] = await Promise.all([
					JourneyStorage.loadPage(user.userId, null),
					JourneyStorage.loadEntries(null),
					JourneyStorage.hasPromptedForAnonymousImport(user.userId)
				]);
				return {
					...page,
					promptAnonymousImport:
						!alreadyPrompted &&
						anonymousEntries.some((entry) => !entry.deletedAt && !entry.lastSyncedAt)
				};
			},
			onLoaded({ user, data }) {
				submittedEntries = data.entries.filter((entry) => !entry.deletedAt);
				nextEntryCursor = data.nextCursor;
				anonymousImportOpen = Boolean(user && data.promptAnonymousImport);
				if (user) queueMicrotask(requestImmediateSync);
			}
		},
		getErrorMessage: (error, fallback) => (error instanceof Error ? error.message : fallback)
	});
	let accountState = $state(account.getState());

	let editorState = $state<EditorState>(EMPTY_STATE);
	let editorInstance = $state(0);
	let expanded = $state(false);
	let overExpandThreshold = false;
	let composer: HTMLElement;
	let composerSlot: HTMLElement;
	let composerAnimation: Animation | undefined;
	let entryBeingEdited = $state<JourneyEntry | null>(null);
	let entrySourceBounds = $state<ElementBounds | null>(null);
	let entryEditorState = $state<EditorState>(EMPTY_STATE);
	let entryEditorClosing = $state(false);
	let discardEntryConfirmationOpen = $state(false);
	let menuOpen = $state(false);
	let theme = $state<'light' | 'dark'>('light');
	let pageScrolled = $state(false);
	let submittedEntries = $state<StoredJourneyEntry[]>([]);
	let nextEntryCursor = $state<EntryCursor | null>(null);
	let loadingOlderEntries = $state(false);
	let timelineScroll: HTMLDivElement;
	let loadSentinel: HTMLDivElement;
	let syncBusy = $state(false);
	let anonymousImportOpen = $state(false);
	let anonymousImportBusy = $state(false);
	let anonymousImportError = $state('');
	let entrySaveError = $state('');
	let syncStatus = $state<AppSyncStatus>('synced');
	let syncStatusLabel = $derived(getSyncStatusLabel(syncStatus));

	onMount(() => {
		const savedTheme = window.localStorage.getItem('ez-journey-theme');
		theme =
			savedTheme === 'light' || savedTheme === 'dark'
				? savedTheme
				: window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light';
		applyTheme();
		const unsubscribeAccount = account.subscribe((state) => (accountState = state));
		void initializeJourney();
		const pageObserver = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMoreEntries();
			},
			{ root: timelineScroll, rootMargin: '320px' }
		);
		if (loadSentinel) pageObserver.observe(loadSentinel);
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
			pageObserver.disconnect();
			unsubscribeAccount();
			account.destroy();
			syncController.cancel();
		};
	});

	async function initializeJourney() {
		if (new URLSearchParams(window.location.search).get('demo') === 'journey') {
			await seedJourneyDemoData();
		}
		const localPage = await JourneyStorage.loadPage(null, null);
		submittedEntries = localPage.entries.filter((entry) => !entry.deletedAt);
		nextEntryCursor = localPage.nextCursor;
		await account.initialize();
	}

	function applyTheme() {
		document.body.dataset.theme = theme;
		window.localStorage.setItem('ez-journey-theme', theme);
	}

	function handleEditorChange(nextState: EditorState) {
		editorState = nextState;
		const nextOverThreshold = shouldExpandAtCursor();

		if (nextOverThreshold && !overExpandThreshold) {
			setExpanded(true);
			menuOpen = false;
		} else if (!nextOverThreshold && expanded) {
			setExpanded(false);
		}

		overExpandThreshold = nextOverThreshold;
	}

	function shouldExpandAtCursor() {
		const editable = composer?.querySelector<HTMLElement>('.editable');
		const selection = window.getSelection();
		if (!editable || !selection?.rangeCount || !selection.anchorNode) return false;
		if (!editable.contains(selection.anchorNode)) return false;

		const range = selection.getRangeAt(0).cloneRange();
		range.collapse(true);
		const anchor =
			selection.anchorNode instanceof HTMLElement
				? selection.anchorNode
				: selection.anchorNode.parentElement;
		const line = anchor?.closest<HTMLElement>('.line');
		const rangeTop = range.getBoundingClientRect().top;
		const cursorTop =
			line && !line.textContent?.trim()
				? line.getBoundingClientRect().top
				: rangeTop || line?.getBoundingClientRect().top || 0;

		const styles = getComputedStyle(editable);
		const contentTop = editable.getBoundingClientRect().top + Number.parseFloat(styles.paddingTop);
		const lineHeight = Number.parseFloat(styles.lineHeight);
		return cursorTop >= contentTop + lineHeight * VISIBLE_EDITOR_LINES - 2;
	}

	function minimize() {
		setExpanded(false);
	}

	function handleEditorFocus(focused: boolean) {
		if (focused && shouldExpandAtCursor()) setExpanded(true);
	}

	function setExpanded(nextExpanded: boolean) {
		if (expanded === nextExpanded) return;

		composerAnimation?.cancel();
		if (composer.style.position === 'fixed' && !expanded) clearFixedBounds(composer);
		const from = readBounds(composer);

		if (nextExpanded) {
			setFixedBounds(composer, from);
			expanded = true;
			requestAnimationFrame(() => {
				clearFixedBounds(composer);
				const to = readBounds(composer);
				composerAnimation = animateBounds(composer, from, to);
			});
			return;
		}

		setFixedBounds(composer, from);
		expanded = false;
		requestAnimationFrame(() => {
			const to = readBounds(composerSlot);
			composerAnimation = animateBounds(composer, from, to);
			if (composerAnimation) {
				composerAnimation.onfinish = () => {
					if (!expanded) clearFixedBounds(composer);
					composerAnimation = undefined;
				};
			} else {
				clearFixedBounds(composer);
			}
		});
	}

	async function submitEntry() {
		const text = editorState.text.trim();
		if (!text) return;

		const timestamp = new Date().toISOString();
		const entry: StoredJourneyEntry = {
			id: crypto.randomUUID(),
			userId: accountState.user?.userId ?? 'anonymous',
			text,
			createdAt: timestamp,
			updatedAt: timestamp,
			deletedAt: null,
			lastSyncedAt: null,
			lastRemoteChangeAt: null
		};
		try {
			await JourneyStorage.saveEntries([entry]);
			submittedEntries = [entry, ...submittedEntries];
			scheduleSync();
			entrySaveError = '';
		} catch (error) {
			entrySaveError = error instanceof Error ? error.message : 'Could not save this entry.';
			return;
		}
		editorState = EMPTY_STATE;
		overExpandThreshold = false;
		setExpanded(false);
		editorInstance += 1;
	}

	function openEntry(entry: JourneyEntry, source: HTMLElement) {
		entryBeingEdited = entry;
		entrySourceBounds = readBounds(source);
		entryEditorState = {
			text: entry.text,
			selectionStart: entry.text.length,
			selectionEnd: entry.text.length
		};
		entryEditorClosing = false;
		menuOpen = false;
	}

	function requestCloseEntry() {
		if (entryBeingEdited) {
			if (entryEditorState.text !== entryBeingEdited.text) {
				discardEntryConfirmationOpen = true;
				return;
			}
			beginCloseEntry();
			return;
		}
		minimize();
	}

	function beginCloseEntry() {
		if (entryBeingEdited) {
			entryEditorClosing = true;
		}
	}

	async function saveCurrentEntry() {
		if (entryBeingEdited) {
			const text = entryEditorState.text.trim();
			if (!text) return;
			const userId = accountState.user?.userId ?? 'anonymous';
			const entries = await JourneyStorage.loadEntries(userId);
			const existing = entries.find((entry) => entry.id === entryBeingEdited?.id);
			if (existing) {
				const updated = {
					...existing,
					text,
					updatedAt: new Date().toISOString(),
					lastSyncedAt: existing.lastSyncedAt,
					lastRemoteChangeAt: existing.lastRemoteChangeAt
				};
				try {
					await JourneyStorage.saveEntries([updated]);
				} catch (error) {
					entrySaveError = error instanceof Error ? error.message : 'Could not save this entry.';
					return;
				}
				submittedEntries = submittedEntries.map((entry) =>
					entry.id === updated.id ? updated : entry
				);
				entrySaveError = '';
				scheduleSync();
			}
			beginCloseEntry();
			return;
		}
		submitEntry();
	}

	function finishEditingEntry() {
		entryBeingEdited = null;
		entrySourceBounds = null;
		entryEditorState = EMPTY_STATE;
		entryEditorClosing = false;
	}

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		applyTheme();
		menuOpen = false;
	}

	function scheduleSync() {
		if (accountState.user && journeyApi) syncController.scheduleDebounced();
	}

	function requestImmediateSync() {
		if (accountState.user && journeyApi) syncController.requestImmediate();
	}

	async function executeSync() {
		const userId = accountState.user?.userId;
		if (!journeyApi || !userId) return;
		syncBusy = true;
		syncStatus = navigator.onLine ? 'syncing' : 'offline';
		try {
			const result = await syncJourneyEntries(journeyApi, userId);
			if (accountState.user?.userId !== userId) return;
			const visibleCount = Math.max(30, submittedEntries.length);
			const latest = [...result.items].sort(
				(a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
			);
			const visible = latest.filter((entry) => !entry.deletedAt).slice(0, visibleCount);
			submittedEntries = visible;
			const last = visible.at(-1);
			nextEntryCursor =
				latest.filter((entry) => !entry.deletedAt).length > visible.length && last
					? { createdAt: last.createdAt, id: last.id }
					: null;
			syncStatus = navigator.onLine ? 'synced' : 'offline';
		} catch (error) {
			if (accountState.user?.userId !== userId) return;
			if (await account.handleAuthFailure(error)) {
				syncStatus = navigator.onLine ? 'synced' : 'offline';
				return;
			}
			syncStatus = navigator.onLine ? 'error' : 'offline';
		} finally {
			syncBusy = false;
		}
	}

	function handleOnline() {
		syncStatus = 'saved_locally';
		requestImmediateSync();
	}

	function handleOffline() {
		syncStatus = 'offline';
	}

	async function loadMoreEntries() {
		const cursor = nextEntryCursor;
		if (!cursor || loadingOlderEntries) return;
		const userId = accountState.user?.userId ?? null;
		loadingOlderEntries = true;
		try {
			const page = await JourneyStorage.loadPage(userId, cursor);
			if ((accountState.user?.userId ?? null) !== userId || nextEntryCursor !== cursor) return;
			submittedEntries = [...submittedEntries, ...page.entries.filter((entry) => !entry.deletedAt)];
			nextEntryCursor = page.nextCursor;
		} finally {
			loadingOlderEntries = false;
		}
	}

	function handleTimelineScroll() {
		pageScrolled = timelineScroll.scrollTop > 0;
	}

	async function resolveAnonymousImport(addToAccount: boolean) {
		const user = accountState.user;
		if (!user || anonymousImportBusy) return;
		anonymousImportBusy = true;
		try {
			if (addToAccount) {
				await JourneyStorage.claimAnonymousEntries(user.userId);
				const page = await JourneyStorage.loadPage(user.userId, null);
				submittedEntries = page.entries.filter((entry) => !entry.deletedAt);
				nextEntryCursor = page.nextCursor;
			}
			await JourneyStorage.markPromptedForAnonymousImport(user.userId);
			anonymousImportOpen = false;
			anonymousImportError = '';
			if (addToAccount) requestImmediateSync();
		} catch (error) {
			anonymousImportError = error instanceof Error ? error.message : 'Could not save your choice.';
		} finally {
			anonymousImportBusy = false;
		}
	}
</script>

<svelte:head>
	<title>ez journey</title>
	<meta name="description" content="A quiet place to collect moments from your day." />
</svelte:head>

<AppShell>
	<Navbar visible>
		<div class="navbar-content">
			<div class="navbar-start">
				{#if expanded || entryBeingEdited}
					<Button
						size="icon"
						ariaLabel={entryBeingEdited ? 'Close journal entry' : 'Minimize entry'}
						onclick={requestCloseEntry}
					>
						<Icon name="chevron-left" />
					</Button>
				{/if}
			</div>

			<div class="navbar-actions">
				{#if entryBeingEdited}
					<Button
						size="icon"
						ariaLabel="Save journal entry"
						disabled={!entryEditorState.text.trim()}
						onclick={saveCurrentEntry}
					>
						<Icon name="check" />
					</Button>
				{:else if expanded}
					<Button
						size="icon"
						ariaLabel="Save and submit entry"
						disabled={!editorState.text.trim()}
						onclick={submitEntry}
					>
						<Icon name="check" />
					</Button>
				{:else if !expanded}
					<div class="menu-control">
						<Button
							size="icon"
							ariaLabel="Open app menu"
							ariaHaspopup="menu"
							ariaExpanded={menuOpen}
							onclick={() => (menuOpen = !menuOpen)}
						>
							<Icon name="ellipsis-horizontal" />
						</Button>
						{#if menuOpen}
							<FloatingMenu label="App menu" onDismiss={() => (menuOpen = false)}>
								<button type="button" role="menuitem" onclick={toggleTheme}>
									{theme === 'dark' ? 'Light mode' : 'Dark mode'}
								</button>
								{#if accountState.user}
									<button
										type="button"
										role="menuitem"
										disabled={syncBusy}
										onclick={requestImmediateSync}>{syncStatusLabel}</button
									>
									<button
										type="button"
										role="menuitem"
										disabled={accountState.authBusy || syncBusy}
										onclick={account.openLoginOrAccountList}>Switch account</button
									>
									<button
										type="button"
										role="menuitem"
										disabled={accountState.authBusy || syncBusy}
										onclick={() => void account.logoutCurrentAccount()}>Log out</button
									>
									<div class="menu-stat">{accountState.user.email ?? accountState.user.userId}</div>
								{:else}
									<button
										type="button"
										role="menuitem"
										disabled={!auth || accountState.authBusy}
										onclick={account.openLoginOrAccountList}>Log in</button
									>
								{/if}
							</FloatingMenu>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</Navbar>

	<Workspace
		maxWidth="calc(680px + var(--space-5) + var(--space-5))"
		topPadding="none"
		fullHeight={true}
	>
		<div class="composer-slot" class:scrolled={pageScrolled} bind:this={composerSlot}>
			<section
				bind:this={composer}
				class:expanded
				class="composer"
				aria-label="Journey entry composer"
			>
				<div class="editor-wrap">
					{#key editorInstance}
						<Editor
							initialState={editorState}
							placeholder="What’s on your mind?"
							onChange={handleEditorChange}
							onFocusChange={handleEditorFocus}
						/>
					{/key}
				</div>
				{#if !expanded}
					<div class="composer-footer">
						<div class="composer-divider"></div>
						<div class="composer-actions">
							<Button variant="primary" disabled={!editorState.text.trim()} onclick={submitEntry}
								>Save</Button
							>
						</div>
					</div>
				{/if}
				{#if entrySaveError}<p class="save-error" role="alert">{entrySaveError}</p>{/if}
			</section>
		</div>

		<div class="timeline-scroll" bind:this={timelineScroll} onscroll={handleTimelineScroll}>
			<JourneyTimeline entries={submittedEntries} onOpen={openEntry} />
			<div class="timeline-sentinel" bind:this={loadSentinel} aria-hidden="true"></div>
			{#if loadingOlderEntries}<p class="timeline-loading" aria-live="polite">
					Loading entries…
				</p>{/if}
		</div>
	</Workspace>

	{#if entryBeingEdited && entrySourceBounds}
		<JourneyEntryEditor
			entry={entryBeingEdited}
			sourceBounds={entrySourceBounds}
			editorState={entryEditorState}
			closing={entryEditorClosing}
			onChange={(state) => (entryEditorState = state)}
			onClosed={finishEditingEntry}
		/>
	{/if}

	<AccountDialogs controller={account} {syncBusy} />
	{#if discardEntryConfirmationOpen}
		<ConfirmModal
			title="Discard changes?"
			message="Your changes to this journal entry haven’t been saved. Discard them?"
			actionLabel="Discard changes"
			danger
			onCancel={() => (discardEntryConfirmationOpen = false)}
			onConfirm={() => {
				discardEntryConfirmationOpen = false;
				beginCloseEntry();
			}}
		/>
	{/if}
	{#if accountState.contextTransition}
		<AccountLoading
			canceling={accountState.contextTransition.canceling}
			errorMessage={accountState.contextTransition.errorMessage}
			cancelable={accountState.contextTransition.cancelable}
			onCancel={() => void account.cancelContextTransition()}
		/>
	{/if}
	{#if anonymousImportOpen}
		<Modal title="Add local entries to this account?" dismissible={false}>
			<p>There are entries saved on this device. Would you like to add them to this account?</p>
			{#if anonymousImportError}<p role="alert">{anonymousImportError}</p>{/if}
			<svelte:fragment slot="actions">
				<Button disabled={anonymousImportBusy} onclick={() => void resolveAnonymousImport(false)}>
					No
				</Button>
				<Button
					variant="primary"
					disabled={anonymousImportBusy}
					onclick={() => void resolveAnonymousImport(true)}
				>
					Yes, add entries
				</Button>
			</svelte:fragment>
		</Modal>
	{/if}
</AppShell>

<style>
	.navbar-content {
		width: 100%;
		min-height: 2rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.navbar-start,
	.navbar-actions,
	.menu-control {
		position: relative;
		display: flex;
		align-items: center;
	}

	.composer {
		--navbar-clearance: calc(max(var(--space-3), env(safe-area-inset-top)) + 2rem);
		--composer-compact-height: calc(3 * 1.7em + 2 * var(--space-4) + 2px);
		--composer-footer-height: 4.25rem;

		position: relative;
		width: 100%;
		height: calc(var(--composer-compact-height) + var(--composer-footer-height));
		box-sizing: border-box;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		border-color: color-mix(in srgb, var(--color-fg) 18%, transparent);
		background: var(--color-bg);
		transition:
			background-color var(--duration-normal) var(--ease-standard),
			border-color var(--duration-normal) var(--ease-standard),
			border-radius 320ms cubic-bezier(0.2, 0, 0, 1);
	}

	.composer-slot {
		position: sticky;
		top: calc(max(var(--space-3), env(safe-area-inset-top)) + 2rem);
		z-index: 2;
		height: calc(3 * 1.7em + 2 * var(--space-4) + 2px + 4.25rem);
		margin-top: calc(max(var(--space-3), env(safe-area-inset-top)) + 2rem + var(--space-3));
		background: var(--color-bg);
	}

	.composer-slot::after {
		position: absolute;
		right: 0;
		bottom: -1.5rem;
		left: 0;
		z-index: 0;
		height: 1.5rem;
		background: linear-gradient(to bottom, var(--color-bg), transparent);
		box-shadow: 0 0.75rem 0.75rem -0.75rem rgb(0 0 0 / 35%);
		opacity: 0;
		content: '';
		pointer-events: none;
		transition: opacity 160ms ease-out;
	}

	.composer-slot.scrolled::after {
		opacity: 1;
	}

	.timeline-scroll {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-bottom: var(--space-6);
		scrollbar-gutter: stable;
	}

	.timeline-sentinel {
		height: 1px;
	}

	.timeline-loading {
		padding: var(--space-3) 0;
		color: var(--color-muted);
		text-align: center;
	}

	.save-error {
		position: absolute;
		bottom: calc(100% + var(--space-2));
		left: var(--space-5);
		margin: 0;
		color: var(--color-danger);
		font-size: var(--font-size-xs);
	}

	:global(body[data-theme='dark']) .composer-slot::after {
		box-shadow: 0 0.75rem 0.75rem -0.75rem rgb(0 0 0 / 75%);
	}

	.editor-wrap {
		position: absolute;
		top: 0;
		left: 50%;
		width: min(680px, calc(100vw - 2 * var(--space-5)));
		height: calc(100dvh - var(--composer-footer-height));
		overflow: visible;
		transform: translateX(-50%);
		transition: top 360ms cubic-bezier(0.2, 0, 0, 1);
	}

	.editor-wrap :global(.editable) {
		min-height: calc(100dvh - 2 * var(--space-8));
		padding: var(--space-4) var(--space-5);
		transition: padding-top 360ms cubic-bezier(0.2, 0, 0, 1);
	}

	.composer.expanded {
		position: fixed;
		top: var(--navbar-clearance);
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 10;
		width: 100vw;
		height: auto;
		min-height: calc(100dvh - var(--navbar-clearance));
		margin: 0;
		padding: 0;
		overflow: visible;
		border: 0;
		border-radius: 0;
		background: var(--color-bg);
	}

	.composer-footer {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 1;
		height: var(--composer-footer-height);
		padding: 0 var(--space-5);
		background: var(--color-bg);
	}

	.composer-divider {
		width: min(680px, 100%);
		height: 1px;
		margin: 0 auto;
		background: color-mix(in srgb, var(--color-fg) 18%, transparent);
	}

	.composer-actions {
		width: min(680px, 100%);
		height: calc(var(--composer-footer-height) - 1px);
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	.composer.expanded .editor-wrap {
		top: calc(-1 * var(--navbar-clearance));
		height: 100dvh;
	}

	.composer.expanded .editor-wrap :global(.editable) {
		padding-top: var(--space-8);
	}
</style>
