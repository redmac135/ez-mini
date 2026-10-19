<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as appPage } from '$app/state';
	import { createAccountDataController } from '@ez/account';
	import { AUTH_SESSION_CACHE_KEY, readCachedAuthSession, writeCachedAuthSession } from '@ez/auth';
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
		Workspace,
		ToastStack,
		createToastController
	} from '@ez/ui';
	import { auth, journeyApi } from '$lib/api';
	import JourneyEntryEditor from '../lib/JourneyEntryEditor.svelte';
	import JourneyTimeline from '../lib/JourneyTimeline.svelte';
	import JourneyCalendar from '../lib/JourneyCalendar.svelte';
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
	import {
		journeyDateKey,
		journeyEntryDateKey,
		journeyEntryForDate,
		loadEntriesThroughDate,
		nextLocalDayStart,
		searchJourneyEntries
	} from '../lib/journey/navigation';

	const EMPTY_STATE: EditorState = { text: '', selectionStart: 0, selectionEnd: 0 };
	const VISIBLE_EDITOR_LINES = 3;
	const syncController = createSyncController({ delayMs: 2500, runSync: executeSync });
	type LoadedJourneyPage = EntryPage & {
		promptAnonymousImport?: boolean;
		initialSyncCompleted?: boolean;
	};
	const account = createAccountDataController<LoadedJourneyPage>({
		authClient: auth,
		adapter: {
			loadAnonymous: () => JourneyStorage.loadPage(null, null),
			async loadAccount(user, options = {}) {
				const [page, anonymousEntries, alreadyPrompted] = await Promise.all([
					JourneyStorage.loadPage(user.userId, null),
					JourneyStorage.loadEntries(null),
					JourneyStorage.hasPromptedForAnonymousImport(user.userId)
				]);
				let accountPage = page;
				let initialSyncCompleted = false;
				if (options.signal && page.entries.length === 0) {
					if (!journeyApi || !navigator.onLine) {
						throw new Error('Account data is not available offline.');
					}
					await syncJourneyEntries(journeyApi, user.userId, options.signal);
					accountPage = await JourneyStorage.loadPage(user.userId, null);
					initialSyncCompleted = true;
				}
				return {
					...accountPage,
					initialSyncCompleted,
					promptAnonymousImport:
						!alreadyPrompted &&
						anonymousEntries.some((entry) => !entry.deletedAt && !entry.lastSyncedAt)
				};
			},
			onLoaded({ user, data }) {
				submittedEntries = data.entries.filter((entry) => !entry.deletedAt);
				nextEntryCursor = data.nextCursor;
				newerEntryCursor = null;
				anonymousImportOpen = Boolean(user && data.promptAnonymousImport);
				if (user && !data.initialSyncCompleted) queueMicrotask(requestImmediateSync);
			}
		},
		getErrorMessage: (error, fallback) => (error instanceof Error ? error.message : fallback),
		onNotice(message) {
			showStatusNotice(message);
		},
		replaceOAuthUrl: (url) => {
			const nextUrl = new URL(url);
			// This URL comes from the current app page after removing OAuth callback parameters.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			replaceState(`${resolve('/')}${nextUrl.search}${nextUrl.hash}`, appPage.state);
		},
		onAuthChanged(user) {
			if (typeof window !== 'undefined') {
				writeCachedAuthSession(window.localStorage, user, AUTH_SESSION_CACHE_KEY);
			}
		}
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
	let calendarOpen = $state(false);
	let searchOpen = $state(false);
	let searchQuery = $state('');
	let savedEntries = $state<StoredJourneyEntry[]>([]);
	let selectedDate = $state(journeyDateKey(new Date()));
	let searchInput = $state<HTMLInputElement>();
	let toastNotices = $state<Array<{ id: number; message: string }>>([]);
	const toastController = createToastController((notices) => (toastNotices = notices));
	let theme = $state<'light' | 'dark'>('light');
	let pageScrolled = $state(false);
	let submittedEntries = $state<StoredJourneyEntry[]>([]);
	let nextEntryCursor = $state<EntryCursor | null>(null);
	let newerEntryCursor = $state<EntryCursor | null>(null);
	let loadingOlderEntries = $state(false);
	let timelinePageLoad: Promise<void> | null = null;
	let dateSelectionToken = 0;
	let timelineScroll: HTMLDivElement;
	let loadSentinel: HTMLDivElement;
	let newerLoadSentinel: HTMLDivElement;
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
				if (entries.some((entry) => entry.target === loadSentinel && entry.isIntersecting)) {
					void loadMoreEntries();
				}
				if (
					entries.some((entry) => entry.target === newerLoadSentinel && entry.isIntersecting)
				) {
					void loadNewerEntries();
				}
			},
			{ root: timelineScroll, rootMargin: '320px' }
		);
		if (loadSentinel) pageObserver.observe(loadSentinel);
		if (newerLoadSentinel) pageObserver.observe(newerLoadSentinel);
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

	function initializeJourney() {
		const initialUser = readCachedAuthSession(window.localStorage, AUTH_SESSION_CACHE_KEY);
		const startAccount = () => setTimeout(() => void account.initialize({ initialUser }), 0);
		if (new URLSearchParams(window.location.search).get('demo') === 'journey') {
			void seedJourneyDemoData().then(startAccount);
		} else {
			startAccount();
		}
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

		const timestampDate = new Date(`${selectedDate}T12:00:00`);
		const now = new Date();
		timestampDate.setHours(
			now.getHours(),
			now.getMinutes(),
			now.getSeconds(),
			now.getMilliseconds()
		);
		const timestamp = timestampDate.toISOString();
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
		if (!accountState.user || !journeyApi) return;
		if (!navigator.onLine) {
			syncStatus = 'offline';
			return;
		}
		syncController.scheduleDebounced();
	}

	function requestImmediateSync() {
		if (!accountState.user || !journeyApi) return;
		if (!navigator.onLine) {
			syncStatus = 'offline';
			return;
		}
		syncController.requestImmediate();
	}

	async function executeSync() {
		const userId = accountState.user?.userId;
		if (!journeyApi || !userId) return;
		if (!navigator.onLine) {
			syncStatus = 'offline';
			return;
		}
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
			newerEntryCursor = null;
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

	async function refreshSavedEntries() {
		const userId = accountState.user?.userId ?? null;
		try {
			const entries = await JourneyStorage.loadEntries(userId);
			if ((accountState.user?.userId ?? null) === userId) savedEntries = entries;
		} catch {
			if ((accountState.user?.userId ?? null) === userId) savedEntries = submittedEntries;
		}
	}

	function loadMoreEntries(): Promise<void> {
		if (timelinePageLoad) return timelinePageLoad;
		const cursor = nextEntryCursor;
		if (!cursor) return Promise.resolve();
		const userId = accountState.user?.userId ?? null;
		loadingOlderEntries = true;
		const load = (async () => {
			try {
				const page = await JourneyStorage.loadPage(userId, cursor);
				if ((accountState.user?.userId ?? null) !== userId || nextEntryCursor !== cursor) return;
				submittedEntries = [...submittedEntries, ...page.entries.filter((entry) => !entry.deletedAt)];
				nextEntryCursor = page.nextCursor;
			} finally {
				loadingOlderEntries = false;
				timelinePageLoad = null;
			}
		})();
		timelinePageLoad = load;
		return load;
	}

	function loadNewerEntries(): Promise<void> {
		if (timelinePageLoad) return timelinePageLoad;
		const cursor = newerEntryCursor;
		if (!cursor) return Promise.resolve();
		const userId = accountState.user?.userId ?? null;
		loadingOlderEntries = true;
		const load = (async () => {
			try {
				let page = await JourneyStorage.loadPageAfter(userId, cursor);
				while (page.entries.every((entry) => entry.deletedAt) && page.nextCursor) {
					if ((accountState.user?.userId ?? null) !== userId) return;
					page = await JourneyStorage.loadPageAfter(userId, page.nextCursor);
				}
				if ((accountState.user?.userId ?? null) !== userId || newerEntryCursor !== cursor) return;
				const combined = new Map(submittedEntries.map((entry) => [entry.id, entry]));
				for (const entry of page.entries) if (!entry.deletedAt) combined.set(entry.id, entry);
				submittedEntries = [...combined.values()].sort(
					(a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
				);
				newerEntryCursor = page.nextCursor;
			} finally {
				loadingOlderEntries = false;
				timelinePageLoad = null;
			}
		})();
		timelinePageLoad = load;
		return load;
	}

	function loadEntriesAtDate(
		date: string,
		userId: string | null,
		isCurrent: () => boolean
	): Promise<void> {
		if (timelinePageLoad) return timelinePageLoad;
		loadingOlderEntries = true;
		const load = (async () => {
			try {
				let page = await JourneyStorage.loadPage(userId, {
					createdAt: nextLocalDayStart(date),
					id: ''
				});
				while (page.entries.every((entry) => entry.deletedAt) && page.nextCursor) {
					if ((accountState.user?.userId ?? null) !== userId || !isCurrent()) return;
					page = await JourneyStorage.loadPage(userId, page.nextCursor);
				}
				if ((accountState.user?.userId ?? null) !== userId || !isCurrent()) return;
				submittedEntries = page.entries.filter((entry) => !entry.deletedAt);
				nextEntryCursor = page.nextCursor;
				const newest = page.entries[0];
				newerEntryCursor = newest ? { createdAt: newest.createdAt, id: newest.id } : null;
				if (newerEntryCursor) {
					const cursor = newerEntryCursor;
					let newerPage = await JourneyStorage.loadPageAfter(userId, cursor);
					while (newerPage.entries.every((entry) => entry.deletedAt) && newerPage.nextCursor) {
						if ((accountState.user?.userId ?? null) !== userId || !isCurrent()) return;
						newerPage = await JourneyStorage.loadPageAfter(userId, newerPage.nextCursor);
					}
					if (
						(accountState.user?.userId ?? null) !== userId ||
						!isCurrent() ||
						newerEntryCursor !== cursor
					) return;
					const combined = new Map(submittedEntries.map((entry) => [entry.id, entry]));
					for (const entry of newerPage.entries) {
						if (!entry.deletedAt) combined.set(entry.id, entry);
					}
					submittedEntries = [...combined.values()].sort(
						(a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
					);
					newerEntryCursor = newerPage.nextCursor;
				}
			} finally {
				loadingOlderEntries = false;
				timelinePageLoad = null;
			}
		})();
		timelinePageLoad = load;
		return load;
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
				newerEntryCursor = null;
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

	function showStatusNotice(message: string) {
		toastController.show(message);
	}

	function dismissToast(id: number) {
		toastController.dismiss(id);
	}

	async function selectJournalDate(date: string) {
		const selectionToken = ++dateSelectionToken;
		const isCurrent = () => selectionToken === dateSelectionToken && selectedDate === date;
		selectedDate = date;
		calendarOpen = false;
		editorState = EMPTY_STATE;
		editorInstance += 1;
		overExpandThreshold = false;
		entrySaveError = '';
		setExpanded(false);
		const userId = accountState.user?.userId ?? null;
		if (timelinePageLoad) await timelinePageLoad;
		if ((accountState.user?.userId ?? null) !== userId || !isCurrent()) return;
		await loadEntriesThroughDate(date, {
			getOldestDate: () => {
				const oldest = submittedEntries.at(-1);
				return oldest ? journeyEntryDateKey(oldest.createdAt) : undefined;
			},
			getNewestDate: () => {
				const newest = submittedEntries[0];
				return newest ? journeyEntryDateKey(newest.createdAt) : undefined;
			},
			hasOlderPage: () => Boolean(nextEntryCursor),
			hasNewerPage: () => Boolean(newerEntryCursor),
			loadOlderPage: loadMoreEntries,
			loadNewerPage: loadNewerEntries,
			loadAnchor: (targetDate) => loadEntriesAtDate(targetDate, userId, isCurrent),
			isCurrent
		});
		if ((accountState.user?.userId ?? null) !== userId || !isCurrent()) return;
		let entriesForEditor = savedEntries;
		try {
			entriesForEditor = await JourneyStorage.loadEntries(userId);
			savedEntries = entriesForEditor;
		} catch {
			entriesForEditor = [...savedEntries, ...submittedEntries];
		}
		if ((accountState.user?.userId ?? null) !== userId || !isCurrent()) return;
		const entryForDate = journeyEntryForDate(entriesForEditor, date);
		requestAnimationFrame(() => {
			if (!isCurrent()) return;
			const groups = [...timelineScroll.querySelectorAll<HTMLElement>('.day-group')];
			const target =
				groups.find((group) => group.dataset.date === date) ??
				groups.find((group) => (group.dataset.date ?? '') < date);
			if (target) timelineScroll.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
			if (entryForDate) {
				const source = timelineScroll.querySelector<HTMLElement>(
					`[data-entry-id="${CSS.escape(entryForDate.id)}"]`
				);
				openEntry(entryForDate, source ?? composer);
			}
		});
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
					<div class="navbar-tools">
						<Button
							size="icon"
							ariaLabel="Search Journey entries"
							onclick={() => {
								searchOpen = true;
								void refreshSavedEntries();
								requestAnimationFrame(() => searchInput?.focus());
							}}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true"
								><circle
									cx="10.8"
									cy="10.8"
									r="6.4"
									fill="none"
									stroke="currentColor"
									stroke-width="1.7"
								/><path
									d="m16 16 4.5 4.5"
									fill="none"
									stroke="currentColor"
									stroke-width="1.7"
									stroke-linecap="round"
								/></svg
							>
						</Button>
						<Button
							size="icon"
							ariaLabel="Open calendar"
							ariaExpanded={calendarOpen}
							onclick={() => {
								calendarOpen = !calendarOpen;
								if (calendarOpen) void refreshSavedEntries();
								menuOpen = false;
							}}><Icon name="calendar-days" /></Button
						>
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
											onclick={() => void account.openConnectedAccounts()}>Profile</button
										>
										<button
											type="button"
											role="menuitem"
											disabled={accountState.authBusy || syncBusy}
											onclick={() => void account.logoutCurrentAccount()}>Log out</button
										>
										<div class="menu-stat">{accountState.displayName}</div>
									{:else}
										<button
											type="button"
											role="menuitem"
											disabled={!auth || accountState.authBusy}
											onclick={account.openLoginOrAccountList}>Login</button
										>
									{/if}
								</FloatingMenu>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</Navbar>
	{#if calendarOpen}<JourneyCalendar
			{selectedDate}
			entries={savedEntries.filter((entry) => !entry.deletedAt)}
			onSelect={selectJournalDate}
			onClose={() => (calendarOpen = false)}
		/>{/if}
	{#if searchOpen}
		<div
			class="search-backdrop"
			role="presentation"
			onclick={(event) => {
				if (event.target === event.currentTarget) searchOpen = false;
			}}
		>
			<section class="search-panel" aria-label="Search Journey entries">
				<input
					bind:this={searchInput}
					bind:value={searchQuery}
					placeholder="Search your entries"
					aria-label="Search Journey entries"
					onkeydown={(event) => {
						if (event.key === 'Escape') searchOpen = false;
					}}
				/>
				{#each searchJourneyEntries(savedEntries, searchQuery)
					.slice(0, 8) as entry (entry.id)}<button
						class="search-result"
						onclick={() => {
							searchOpen = false;
							openEntry(entry, document.body);
						}}>{entry.text}<small>{new Date(entry.createdAt).toLocaleDateString()}</small></button
					>{/each}
			</section>
		</div>
	{/if}

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
			<div class="timeline-sentinel" bind:this={newerLoadSentinel} aria-hidden="true"></div>
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
	<ToastStack notices={toastNotices} onDismiss={dismissToast} />
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
	.menu-control,
	.navbar-tools {
		position: relative;
		display: flex;
		align-items: center;
	}

	.navbar-tools {
		gap: var(--space-1);
	}
	.navbar-tools :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
	}
	.search-backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgb(0 0 0 / 24%);
		padding: 12vh var(--space-5) 0;
	}
	.search-panel {
		width: min(34rem, 100%);
		margin: 0 auto;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-bg);
		box-shadow: 0 12px 38px #0002;
	}
	.search-panel input {
		width: 100%;
		box-sizing: border-box;
		border: 0;
		border-bottom: 1px solid var(--color-border);
		padding: var(--space-3);
		background: transparent;
		color: inherit;
		font: inherit;
		outline: none;
	}
	.search-result {
		display: block;
		width: 100%;
		padding: var(--space-3);
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.search-result:hover {
		background: color-mix(in srgb, var(--color-fg) 7%, transparent);
	}
	.search-result small {
		display: block;
		color: var(--color-muted);
		margin-top: 3px;
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

	.timeline-sentinel,
	.timeline-newer-sentinel {
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
