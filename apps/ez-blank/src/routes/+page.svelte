<script lang="ts">
	import { browser } from '$app/environment';
	import type { AuthSessionSummary } from '@ez/auth';
	import { createAccountDataController } from '@ez/account';
	import { onDestroy, onMount, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { SvelteMap } from 'svelte/reactivity';
	import Editor from '$lib/Editor.svelte';
	import {
		APP_UPDATED_NOTICE,
		APP_UPDATED_NOTICE_EVENT,
		consumeQueuedAppUpdatedNotice
	} from '$lib/pwa-update-notice';
	import { loadEditorAuthState, type LoadedEditorAuthState } from '$lib/auth/editor-auth-state';
	import {
		clearCachedAuthSessionForUser as clearCachedAuthSessionForUserInStorage,
		readCachedAuthSession as readCachedAuthSessionFromStorage,
		writeCachedAuthSession as writeCachedAuthSessionToStorage
	} from '$lib/auth/session-cache';
	import {
		AccountModal,
		AppShell,
		Button,
		ConfirmModal,
		FloatingMenu,
		Icon,
		LoginModal,
		Modal,
		Navbar,
		Sidebar
	} from '@ez/ui';
	import {
		getSettledAppSyncStatus as deriveSettledAppSyncStatus,
		type AppSyncStatus
	} from '$lib/editor/app-sync-status';
	import { createActivePageController } from '$lib/editor/active-page-controller';
	import {
		applyEditorStateUpdate,
		applyHydratedSession,
		applySessionUpdate,
		type PageEditorUpdate
	} from '$lib/editor/core/app-state';
	import { createSyncController, getSyncStatusLabel } from '@ez/sync';
	import {
		areEditorSessionsEquivalent,
		getChangedPageEvents,
		type ChangedPageEvent,
		type LocalPageEventType
	} from '$lib/editor/persistence/session-events';
	import {
		createPageBroadcastMessage,
		PAGES_CHANNEL_NAME,
		readPageBroadcastMessage
	} from '$lib/editor/persistence/page-broadcast';
	import { mergeEditorSelections } from '$lib/editor/persistence/session-selection';
	import {
		buildCountOptions,
		type CountDisplayMode,
		type MobileCountVisibilityOption
	} from '$lib/editor/core/metrics';
	import {
		cycleCountVisibility,
		DEFAULT_PREFERENCES,
		getCountVisibilityLabel,
		normalizePreferences,
		type EditorPreferences,
		type ThemeMode
	} from '$lib/editor/core/preferences';
	import { EditorStorage } from '$lib/editor/persistence/storage';
	import { ANONYMOUS_USERID } from '$lib/editor/persistence/records';
	import { pushRemoteActivePageId, reconcileSyncResult, syncUserPages } from '$lib/editor/sync';
	import { auth, pagesApi } from '$lib/api';
	import {
		clonePageForUser,
		createPage,
		createSession,
		markPageDeleted,
		ensureValidActivePage,
		getRemoteActivePageUpdateTarget,
		sortPagesByRecency,
		materializePage,
		type EditorPage,
		type EditorSession,
		updatePageTitle
	} from '$lib/editor/core/session';

	let session: EditorSession = { pages: [], activePageId: '' };
	let drawerOpen = false;
	let loaded = false;
	let menuPageId: string | null = null;
	let editingPageId: string | null = null;
	let deletePageId: string | null = null;
	let titleDraft = '';
	let countDisplayMode: CountDisplayMode = 'words';
	let chromeVisible = true;
	let isMobileViewport = false;
	let previousActiveText = '';

	let emailDraft = '';
	let otpDraft = '';
	let loginModalOpen = false;
	let accountModalOpen = false;
	let importPromptOpen = false;
	let authUser: AuthSessionSummary | null = null;
	let authSessions: AuthSessionSummary[] = [];
	let authBusy = false;
	let accountBusySessionId: string | null = null;
	let authMessage = '';
	let loginSubmitting = false;
	let loginStep: 'email' | 'otp' = 'email';
	let otpVerifying = false;
	let otpShake = false;
	let resendCooldownRemaining = 0;
	let pendingAnonymousImportSession: EditorSession | null = null;
	let syncBusy = false;
	let appSyncStatus: AppSyncStatus = 'synced';

	let titleInput: HTMLInputElement | null = null;
	let countButton: HTMLButtonElement | null = null;
	let settingsButton: HTMLButtonElement | null = null;
	let drawerToggleButton: HTMLButtonElement | null = null;
	let workspaceSection: HTMLElement | null = null;

	let countMenuOpen = false;
	let settingsMenuOpen = false;
	let hideChromeTimeout: ReturnType<typeof setTimeout> | null = null;
	let preferences: EditorPreferences = DEFAULT_PREFERENCES;

	let toastNotices: Array<{ id: number; message: string }> = [];
	let nextToastId = 1;
	let toastTimeouts = new SvelteMap<number, number>();
	let workspacePersistQueue: Promise<void> = Promise.resolve();
	let pagesChannel: BroadcastChannel | null = null;
	let editorIdleTimeout: ReturnType<typeof setTimeout> | null = null;
	let sidebarSwipeStart: { x: number; y: number } | null = null;
	let sidebarSwipeTracking = false;

	const LOCAL_PAGE_EVENT_TYPES: Set<LocalPageEventType> = new Set([
		'page-updated',
		'title-updated',
		'new-page',
		'deleted-page'
	]);

	const TOP_REVEAL_HEIGHT = 112;
	const CHROME_HIDE_DELAY = 1400;
	const MOBILE_VIEWPORT_QUERY = '(max-width: 720px)';
	const SIDEBAR_SWIPE_EDGE_PX = 28;
	const SIDEBAR_SWIPE_MIN_X = 72;
	const SIDEBAR_SWIPE_MAX_Y = 42;
	const MOBILE_COUNT_OPTIONS = [
		{ id: 'shown', label: 'Shown' },
		{ id: 'hidden', label: 'Hidden' }
	] as const;
	const EDIT_SYNC_DEBOUNCE_MS = 3000;
	const ACTIVE_PAGE_PUSH_DEBOUNCE_MS = 300;
	const syncController = createSyncController({
		delayMs: EDIT_SYNC_DEBOUNCE_MS,
		runSync: executeSync
	});
	const activePageController = createActivePageController({
		delayMs: ACTIVE_PAGE_PUSH_DEBOUNCE_MS,
		runPush: async (pageId: string) => {
			if (!authUser || !loaded) {
				return;
			}

			try {
				await pushRemoteActivePageId(pagesApi, pageId);
			} catch (error) {
				await account.handleAuthFailure(error);
			}
		}
	});
	const account = createAccountDataController<LoadedEditorAuthState>({
		authClient: auth,
		adapter: {
			loadAnonymous: () => loadBlankAccountData(null),
			loadAccount: (user) => loadBlankAccountData(user),
			deleteAccountData: (userId) => deleteLocalUserData(userId),
			onLoaded({ data }) {
				applyLoadedBlankAccountData(data);
			}
		},
		getErrorMessage,
		onNotice(message) {
			showStatusNotice(message);
		},
		onAuthChanged(nextUser) {
			writeCachedAuthSession(nextUser);
		}
	});
	let accountState = account.getState();

	$: activePage = getActivePage(session);
	$: visiblePages = session.pages.filter((page) => page.deletedAt === null);
	$: activeText = activePage.content;
	$: hasDocumentContent = activeText.length > 0;
	$: countOptions = buildCountOptions(activeText);
	$: mobileCountVisibility = (
		preferences.countVisibility === 'hidden' ? 'hidden' : 'shown'
	) as MobileCountVisibilityOption;
	$: currentCountLabel =
		countOptions.find((option) => option.id === countDisplayMode)?.label ?? countOptions[0].label;
	$: countVisibleInChrome = preferences.countVisibility !== 'hidden';
	$: countPinnedVisible = preferences.countVisibility === 'pinned';
	$: countVisible =
		countVisibleInChrome &&
		!drawerOpen &&
		(isMobileViewport || chromeVisible || countPinnedVisible || countMenuOpen);
	$: countDockedRight = countPinnedVisible && !chromeVisible && !settingsMenuOpen;
	$: pageTheme = preferences.themeMode;
	$: deletePage = deletePageId
		? (session.pages.find((page) => page.id === deletePageId) ?? null)
		: null;
	$: syncStatusLabel = getSyncStatusLabel(appSyncStatus);
	$: accountState = $account;
	$: authUser = accountState.user;
	$: authSessions = accountState.sessions;
	$: authBusy = accountState.authBusy;
	$: accountBusySessionId = accountState.accountBusySessionId;
	$: authMessage = accountState.authMessage;
	$: loginModalOpen = accountState.loginModalOpen;
	$: accountModalOpen = accountState.accountModalOpen;
	$: loginStep = accountState.loginStep;
	$: emailDraft = accountState.emailDraft;
	$: otpDraft = accountState.otpDraft;
	$: loginSubmitting = accountState.loginSubmitting;
	$: otpVerifying = accountState.otpVerifying;
	$: otpShake = accountState.otpShake;
	$: resendCooldownRemaining = accountState.resendCooldownRemaining;

	$: if (!hasDocumentContent || drawerOpen || countMenuOpen || settingsMenuOpen) {
		chromeVisible = true;
		clearHideChromeTimeout();
	}

	$: if (isMobileViewport) {
		chromeVisible = true;
		clearHideChromeTimeout();
	}

	$: if (activeText !== previousActiveText) {
		const textIsEmpty = activeText.length === 0;
		previousActiveText = activeText;

		if (isMobileViewport || textIsEmpty) {
			chromeVisible = true;
			clearHideChromeTimeout();
		} else if (!drawerOpen && !countMenuOpen) {
			chromeVisible = false;
			clearHideChromeTimeout();
		}
	}

	$: if (loaded) {
		applyTheme(pageTheme);
	}

	function getActivePage(currentSession: EditorSession): EditorPage {
		const visiblePage =
			currentSession.pages.find(
				(page) => page.id === currentSession.activePageId && page.deletedAt === null
			) ?? currentSession.pages.find((page) => page.deletedAt === null);

		if (visiblePage) {
			return visiblePage;
		}

		return currentSession.pages[0] ?? createPage('', { userId: getScopedUserId() });
	}

	function getSettledAppSyncStatus(currentSession: EditorSession): AppSyncStatus {
		return deriveSettledAppSyncStatus(currentSession, isBrowserOnline());
	}

	function queueRemoteActivePageUpdate(previousSession: EditorSession, nextSession: EditorSession) {
		const pageId = getRemoteActivePageUpdateTarget(previousSession, nextSession);
		if (!pageId || !authUser || !loaded) {
			return;
		}

		activePageController.schedule(pageId);
	}

	function persistSession(nextSession: EditorSession) {
		const normalizedSession = ensureValidActivePage(nextSession);
		const previousSession = session;
		const transition = applySessionUpdate({ session, loaded }, normalizedSession);
		session = transition.state.session;
		queueRemoteActivePageUpdate(previousSession, transition.state.session);
		if (transition.persistedSession) {
			void persistWorkspaceState(previousSession, transition.persistedSession);
		}
	}

	function replaceLocalSession(
		nextSession: EditorSession,
		options: {
			persist?: boolean;
			source?: string;
			details?: Record<string, unknown>;
		} = {}
	) {
		const previousSession = session;
		session = ensureValidActivePage(nextSession);
		queueRemoteActivePageUpdate(previousSession, session);
		if (loaded && options.persist) {
			void persistWorkspaceState(previousSession, session);
		}
	}

	function updateActivePage(update: PageEditorUpdate) {
		if (!session.pages.some((page) => page.id === update.pageId)) {
			return;
		}

		const previousSession = session;
		const transition = applyEditorStateUpdate({ session, loaded }, update);
		session = {
			...transition.state.session,
			pages: sortPagesByRecency(transition.state.session.pages)
		};
		queueRemoteActivePageUpdate(previousSession, transition.state.session);
		if (transition.persistedSession) {
			const previousPage = previousSession.pages.find(
				(page) => page.id === previousSession.activePageId
			);
			const nextPage = transition.state.session.pages.find(
				(page) => page.id === transition.state.session.activePageId
			);
			const changedNoteData =
				!!previousPage &&
				!!nextPage &&
				(previousPage.title !== nextPage.title ||
					previousPage.content !== nextPage.content ||
					previousPage.deletedAt !== nextPage.deletedAt);
			if (changedNoteData) {
				markSavedLocally();
				scheduleEditorIdleFlush();
				scheduleDebouncedSync();
			}
			void persistWorkspaceState(previousSession, transition.persistedSession);
		}
	}

	function handleEditorFocusChange(focused: boolean) {
		void focused;
	}

	function scheduleEditorIdleFlush() {
		clearEditorIdleFlush();
		editorIdleTimeout = setTimeout(() => {
			editorIdleTimeout = null;
		}, 900);
	}

	function clearEditorIdleFlush() {
		if (editorIdleTimeout) {
			clearTimeout(editorIdleTimeout);
			editorIdleTimeout = null;
		}
	}

	function selectPage(pageId: string) {
		if (editingPageId) return;
		const targetPage = session.pages.find((page) => page.id === pageId && page.deletedAt === null);
		if (!targetPage) return;
		persistSession({
			...session,
			activePageId: pageId
		});
		menuPageId = null;
		drawerOpen = false;
	}

	function addPage() {
		const currentActivePageId = session.activePageId;
		const page = createPage('', { userId: getScopedUserId(), isEphemeral: true });
		persistSession({
			pages: [
				...session.pages.map((existingPage) =>
					existingPage.id === currentActivePageId ? materializePage(existingPage) : existingPage
				),
				page
			],
			activePageId: page.id
		});
		markSavedLocally();
		menuPageId = null;
		drawerOpen = false;
	}

	function closePage(pageId: string) {
		const deletedPage = session.pages.find((page) => page.id === pageId);
		if (!deletedPage) {
			menuPageId = null;
			deletePageId = null;
			return;
		}

		const nextPages = session.pages.map((page) =>
			page.id === pageId ? markPageDeleted(page) : page
		);
		const nextVisiblePages = nextPages.filter((page) => page.deletedAt === null);
		if (nextVisiblePages.length === 0) {
			const replacementPage = createPage('', { userId: getScopedUserId(), isEphemeral: true });
			nextPages.push(replacementPage);
			persistSession({
				pages: nextPages,
				activePageId: replacementPage.id
			});
		} else {
			const nextActivePageId =
				session.activePageId === pageId
					? (nextVisiblePages[0]?.id ?? session.activePageId)
					: session.activePageId;

			persistSession({
				pages: nextPages,
				activePageId: nextActivePageId
			});
		}
		menuPageId = null;
		deletePageId = null;
		markSavedLocally();
		requestImmediateSync();
	}

	function toggleMenu(pageId: string) {
		if (editingPageId === pageId) return;
		menuPageId = menuPageId === pageId ? null : pageId;
	}

	async function startEditingTitle(pageId: string) {
		const page = session.pages.find((entry) => entry.id === pageId);
		if (!page) return;
		menuPageId = null;
		editingPageId = pageId;
		titleDraft = page.title;
		await tick();
		titleInput?.focus();
		titleInput?.select();
	}

	function confirmTitleEdit() {
		if (!editingPageId) return;

		const pageId = editingPageId;
		editingPageId = null;
		persistSession({
			...session,
			pages: session.pages.map((entry) =>
				entry.id === pageId ? updatePageTitle(entry, titleDraft) : entry
			)
		});
		markSavedLocally();
		requestImmediateSync();
	}

	function cancelTitleEdit() {
		editingPageId = null;
		titleDraft = '';
	}

	function queueWorkspacePersist(task: () => Promise<void>) {
		workspacePersistQueue = workspacePersistQueue.then(task).catch((error) => {
			console.error('Failed to persist editor workspace:', error);
		});

		return workspacePersistQueue;
	}

	function openDeleteModal(pageId: string) {
		menuPageId = null;
		deletePageId = pageId;
	}

	function closeDeleteModal() {
		deletePageId = null;
	}

	function closeLoginModal() {
		account.closeLoginModal();
	}

	function closeAccountModal() {
		account.closeAccountModal();
	}

	async function openLoginFlow() {
		account.openLoginFlow();
	}

	async function openLoginOrAccountList() {
		await account.openLoginOrAccountList();
	}

	async function switchAccount() {
		await account.openLoginOrAccountList();
	}

	async function submitLogin(nextEmail = emailDraft) {
		await account.submitLogin(nextEmail);
	}

	async function verifyOtpCode(code: string) {
		await account.verifyOtpCode(code);
	}

	async function resendOtpCode() {
		await account.resendOtpCode();
	}

	async function logoutCurrentAccount() {
		if (!authUser || authBusy || syncBusy) return;

		await account.logoutCurrentAccount();
		settingsMenuOpen = false;
	}

	async function logoutAccountSession(sessionId: string, userId: string) {
		clearAllToasts();
		await account.logoutAccountSession(sessionId, userId);
	}

	async function selectAccountSession(nextSessionId: string) {
		await account.selectAccountSession(nextSessionId);
	}

	async function resolveAnonymousImport(addAnonymousToAccount: boolean) {
		if (authUser && pendingAnonymousImportSession) {
			await EditorStorage.markPromptedForAnonymousImport(authUser.userId);
		}

		if (addAnonymousToAccount && pendingAnonymousImportSession) {
			const targetUserId = getScopedUserId(authUser?.userId);
			const nextSession: EditorSession = {
				pages: [
					...session.pages,
					...pendingAnonymousImportSession.pages.map((page) => clonePageForUser(page, targetUserId))
				],
				activePageId: session.activePageId
			};

			replaceLocalSession(nextSession, {
				persist: true
			});
		}

		pendingAnonymousImportSession = null;
		importPromptOpen = false;
		loginModalOpen = false;
	}

	function clearHideChromeTimeout() {
		if (hideChromeTimeout) {
			clearTimeout(hideChromeTimeout);
			hideChromeTimeout = null;
		}
	}

	function scheduleChromeHide() {
		clearHideChromeTimeout();
		if (
			isMobileViewport ||
			!hasDocumentContent ||
			drawerOpen ||
			countMenuOpen ||
			settingsMenuOpen
		) {
			return;
		}

		hideChromeTimeout = setTimeout(() => {
			chromeVisible = false;
			hideChromeTimeout = null;
		}, CHROME_HIDE_DELAY);
	}

	function revealChrome(persist = false) {
		chromeVisible = true;
		if (persist || isMobileViewport) {
			clearHideChromeTimeout();
			return;
		}

		scheduleChromeHide();
	}

	function toggleCountMenu() {
		countMenuOpen = !countMenuOpen;
		settingsMenuOpen = false;
		if (countMenuOpen) {
			revealChrome(true);
			return;
		}

		scheduleChromeHide();
	}

	function selectCountDisplay(nextMode: CountDisplayMode) {
		countDisplayMode = nextMode;
		countMenuOpen = false;
		scheduleChromeHide();
	}

	function selectMobileCountVisibility(nextMode: MobileCountVisibilityOption) {
		updatePreferences({
			...preferences,
			countVisibility: nextMode === 'hidden' ? 'hidden' : 'auto'
		});
		countMenuOpen = false;
	}

	function toggleSettingsMenu() {
		settingsMenuOpen = !settingsMenuOpen;
		countMenuOpen = false;
		if (settingsMenuOpen) {
			revealChrome(true);
			return;
		}

		scheduleChromeHide();
	}

	function updatePreferences(nextPreferences: EditorPreferences) {
		preferences = nextPreferences;
		applyTheme(nextPreferences.themeMode);
		void savePreferences(nextPreferences);
	}

	function toggleThemeMode() {
		updatePreferences({
			...preferences,
			themeMode: preferences.themeMode === 'dark' ? 'light' : 'dark'
		});
	}

	function toggleSpellcheck() {
		updatePreferences({
			...preferences,
			spellcheckEnabled: !preferences.spellcheckEnabled
		});
	}

	function cycleWordCountVisibility() {
		if (isMobileViewport) {
			updatePreferences({
				...preferences,
				countVisibility: preferences.countVisibility === 'hidden' ? 'auto' : 'hidden'
			});
			return;
		}

		updatePreferences({
			...preferences,
			countVisibility: cycleCountVisibility(preferences.countVisibility)
		});
	}

	function handleMouseMove(event: MouseEvent) {
		if (isMobileViewport) return;
		if (event.clientY <= TOP_REVEAL_HEIGHT) {
			revealChrome();
		}
	}

	function handleWindowPointerDown(event: MouseEvent) {
		const target = event.target;
		if (!(target instanceof Node)) return;

		if (countMenuOpen) {
			if (
				countButton?.contains(target) ||
				(target instanceof Element && target.closest('.count-control'))
			) {
				return;
			}
			countMenuOpen = false;
		}

		if (settingsMenuOpen) {
			if (
				settingsButton?.contains(target) ||
				(target instanceof Element && target.closest('.settings-control'))
			) {
				return;
			}
			settingsMenuOpen = false;
		}

		scheduleChromeHide();
	}

	function handleTouchStart(event: TouchEvent) {
		if (!isMobileViewport || drawerOpen || event.touches.length !== 1) {
			sidebarSwipeStart = null;
			sidebarSwipeTracking = false;
			return;
		}

		const touch = event.touches[0];
		if (!touch || touch.clientX > SIDEBAR_SWIPE_EDGE_PX) {
			sidebarSwipeStart = null;
			sidebarSwipeTracking = false;
			return;
		}

		sidebarSwipeStart = {
			x: touch.clientX,
			y: touch.clientY
		};
		sidebarSwipeTracking = true;
	}

	function handleTouchMove(event: TouchEvent) {
		if (!sidebarSwipeTracking || !sidebarSwipeStart || drawerOpen || event.touches.length !== 1) {
			return;
		}

		const touch = event.touches[0];
		if (!touch) return;

		const deltaX = touch.clientX - sidebarSwipeStart.x;
		const deltaY = Math.abs(touch.clientY - sidebarSwipeStart.y);

		if (deltaY > SIDEBAR_SWIPE_MAX_Y && deltaY > deltaX) {
			sidebarSwipeStart = null;
			sidebarSwipeTracking = false;
			return;
		}

		if (deltaX >= SIDEBAR_SWIPE_MIN_X && deltaY <= SIDEBAR_SWIPE_MAX_Y) {
			drawerOpen = true;
			sidebarSwipeStart = null;
			sidebarSwipeTracking = false;
		}
	}

	function handleTouchEnd() {
		sidebarSwipeStart = null;
		sidebarSwipeTracking = false;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		const isCtrlShiftShortcut = event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey;

		if (isCtrlShiftShortcut && event.key.toLowerCase() === 'n') {
			event.preventDefault();
			addPage();
			return;
		}

		if (isCtrlShiftShortcut && event.key.toLowerCase() === 's') {
			event.preventDefault();
			requestImmediateSync({ showSuccessNotice: true });
			return;
		}

		if (event.key !== 'Escape') return;

		let handled = false;

		if (countMenuOpen) {
			countMenuOpen = false;
			scheduleChromeHide();
			handled = true;
		}

		if (settingsMenuOpen) {
			settingsMenuOpen = false;
			scheduleChromeHide();
			handled = true;
		}

		if (drawerOpen) {
			drawerOpen = false;
			menuPageId = null;
			handled = true;
		}

		if (focusAwayFromEditor()) {
			handled = true;
		}

		if (handled) {
			event.preventDefault();
		}
	}

	function focusAwayFromEditor() {
		if (!browser) {
			return false;
		}

		const activeElement = document.activeElement;
		if (!(activeElement instanceof HTMLElement) || !activeElement.closest('.editable')) {
			return false;
		}

		activeElement.blur();
		const fallbackTarget =
			drawerToggleButton ??
			(drawerOpen ? document.querySelector('.page-tab') : null) ??
			settingsButton ??
			countButton ??
			workspaceSection;
		if (fallbackTarget instanceof HTMLElement) {
			fallbackTarget.focus();
		}

		return true;
	}

	function handleDocumentVisibilityChange() {
		if (browser && document.visibilityState === 'hidden') {
			requestImmediateSync();
		}
	}

	function handleWindowOffline() {
		appSyncStatus = 'offline';
	}

	onMount(() => {
		const mobileViewportMedia = window.matchMedia(MOBILE_VIEWPORT_QUERY);
		const syncMobileViewport = () => {
			isMobileViewport = mobileViewportMedia.matches;
			if (isMobileViewport) {
				chromeVisible = true;
				clearHideChromeTimeout();
			}
		};
		syncMobileViewport();
		mobileViewportMedia.addEventListener('change', syncMobileViewport);

		document.addEventListener('visibilitychange', handleDocumentVisibilityChange);

		void (async () => {
			const cachedAuthSession = readCachedAuthSession();
			await hydrateInitialLocalState(cachedAuthSession);
			previousActiveText = getActivePage(session).content;
			applyTheme(preferences.themeMode);
			showQueuedAppUpdatedNotice();
			setupNotesChannel();
			void account.initialize({ initialUser: cachedAuthSession });
		})();

		window.addEventListener(APP_UPDATED_NOTICE_EVENT, handleAppUpdatedNotice);

		return () => {
			mobileViewportMedia.removeEventListener('change', syncMobileViewport);
		};
	});

	onDestroy(() => {
		clearHideChromeTimeout();
		clearEditorIdleFlush();
		syncController.cancel();
		activePageController.cancel();
		clearAllToasts();
		if (browser) {
			document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
			window.removeEventListener(APP_UPDATED_NOTICE_EVENT, handleAppUpdatedNotice);
		}
		pagesChannel?.close();
		pagesChannel = null;
		account.destroy();
	});

	async function loadBlankAccountData(user: AuthSessionSummary | null) {
		if (user) {
			appSyncStatus = isBrowserOnline() ? 'syncing' : 'offline';
		}

		return loadEditorAuthState({
			user,
			loader: {
				loadUserState: (userId) => EditorStorage.loadUserState(userId),
				loadAnonymousState: () => EditorStorage.loadAnonymousState(),
				hasPromptedForAnonymousImport: (userId) =>
					EditorStorage.hasPromptedForAnonymousImport(userId),
				loadPreferences
			},
			pagesApi,
			isOnline: isBrowserOnline()
		});
	}

	function applyLoadedBlankAccountData(loadedAuthState: LoadedEditorAuthState) {
		appSyncStatus = loadedAuthState.appSyncStatus;
		preferences = loadedAuthState.preferences;
		applyTheme(preferences.themeMode);

		if (!areEditorSessionsEquivalent(loadedAuthState.session, session)) {
			replaceLocalSession(mergeEditorSelections(loadedAuthState.session, session), {
				source: loadedAuthState.user
					? 'accountController:authenticated-session'
					: 'accountController:anonymous-session'
			});
		}
		pendingAnonymousImportSession = loadedAuthState.pendingAnonymousImportSession;
		importPromptOpen = loadedAuthState.importPromptOpen;
	}

	async function loadPreferences(userId = getScopedUserId()) {
		const loadedPreferences = await EditorStorage.loadPreferences(userId);
		return normalizePreferences(loadedPreferences);
	}

	async function hydrateInitialLocalState(nextUser: AuthSessionSummary | null) {
		authUser = nextUser;

		if (!nextUser) {
			const [anonymousSession, anonymousPreferences] = await Promise.all([
				EditorStorage.loadUserState(ANONYMOUS_USERID),
				loadPreferences(ANONYMOUS_USERID)
			]);
			const hydratedState = applyHydratedSession(
				anonymousSession ?? createSession(ANONYMOUS_USERID)
			);
			session = hydratedState.session;
			loaded = hydratedState.loaded;
			preferences = anonymousPreferences;
			appSyncStatus = getSettledAppSyncStatus(session);
			return;
		}

		const [userLocal, userPreferences] = await Promise.all([
			EditorStorage.loadUserState(nextUser.userId),
			loadPreferences(nextUser.userId)
		]);
		const hydratedState = applyHydratedSession(userLocal ?? createSession(nextUser.userId));
		session = hydratedState.session;
		loaded = hydratedState.loaded;
		preferences = userPreferences;
		appSyncStatus = getSettledAppSyncStatus(session);
	}

	async function savePreferences(nextPreferences: EditorPreferences) {
		await EditorStorage.savePreferences(getScopedUserId(), nextPreferences);
	}

	function applyTheme(themeMode: ThemeMode) {
		if (!browser) {
			return;
		}

		document.body.dataset.theme = themeMode;
	}

	function isBrowserOnline() {
		return !browser || navigator.onLine;
	}

	function showQueuedAppUpdatedNotice() {
		if (!browser) {
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

	function readCachedAuthSession(): AuthSessionSummary | null {
		if (!browser) {
			return null;
		}

		return readCachedAuthSessionFromStorage(window.localStorage);
	}

	function writeCachedAuthSession(nextUser: AuthSessionSummary | null) {
		if (!browser) {
			return;
		}

		writeCachedAuthSessionToStorage(window.localStorage, nextUser);
	}

	function clearCachedAuthSessionForUser(userId: string) {
		if (!browser) {
			return;
		}

		clearCachedAuthSessionForUserInStorage(window.localStorage, userId);
	}

	function handleAppUpdatedNotice() {
		showQueuedAppUpdatedNotice();
		if (toastNotices.length === 0) {
			showStatusNotice(APP_UPDATED_NOTICE);
		}
	}

	async function deleteLocalUserData(userId: string) {
		await EditorStorage.deleteUserData(userId);
		clearCachedAuthSessionForUser(userId);
	}

	async function persistWorkspaceState(
		previousSession: EditorSession,
		nextSession: EditorSession
	): Promise<ChangedPageEvent[]> {
		const targetUserId = getScopedUserId();
		const sessionSnapshot: EditorSession = {
			activePageId: nextSession.activePageId,
			pages: nextSession.pages.map((page) => ({ ...page, userId: targetUserId }))
		};
		const changedEvents = getChangedPageEvents(previousSession, sessionSnapshot);

		await queueWorkspacePersist(async () => {
			if (targetUserId === ANONYMOUS_USERID) {
				await EditorStorage.saveAnonymousState(sessionSnapshot);
			} else {
				await EditorStorage.saveUserState(targetUserId, sessionSnapshot);
			}

			broadcastPageUpdates(changedEvents);
		});

		return changedEvents;
	}

	function setupNotesChannel() {
		if (!browser || typeof BroadcastChannel === 'undefined') {
			return;
		}

		pagesChannel?.close();
		pagesChannel = new BroadcastChannel(PAGES_CHANNEL_NAME);
		pagesChannel.onmessage = (event) => {
			const message = readPageBroadcastMessage(
				event.data,
				LOCAL_PAGE_EVENT_TYPES,
				getScopedUserId()
			);
			if (!message) {
				return;
			}

			void refreshPageFromIndexedDb(message.type, message.id);
		};
	}

	function broadcastPageUpdates(events: ChangedPageEvent[]) {
		if (!pagesChannel || events.length === 0) {
			return;
		}

		const userId = getScopedUserId();
		for (const event of events) {
			pagesChannel.postMessage(createPageBroadcastMessage(event, userId));
		}
	}

	async function refreshPageFromIndexedDb(eventType: LocalPageEventType, noteId: string) {
		const page = authUser
			? await EditorStorage.loadUserPage(authUser.userId, noteId)
			: await EditorStorage.loadAnonymousPage(noteId);
		if (!page) {
			if (eventType !== 'deleted-page') {
				return;
			}

			const nextSession = {
				...session,
				pages: session.pages.filter((entry) => entry.id !== noteId)
			};
			if (areEditorSessionsEquivalent(nextSession, session)) {
				return;
			}

			replaceLocalSession(nextSession, {
				persist: false,
				source: 'refreshPageFromIndexedDb:deleted-page',
				details: { eventType, noteId }
			});
			return;
		}

		const existingPage = session.pages.find((entry) => entry.id === noteId) ?? null;
		const nextSession: EditorSession = existingPage
			? {
					...session,
					pages: session.pages.map((entry) => (entry.id === noteId ? { ...page } : entry))
				}
			: {
					...session,
					pages: [...session.pages, { ...page }]
				};

		if (areEditorSessionsEquivalent(nextSession, session)) {
			return;
		}

		replaceLocalSession(mergeEditorSelections(nextSession, session), {
			persist: false,
			source: 'refreshPageFromIndexedDb:page-load',
			details: { eventType, noteId }
		});
	}

	function showStatusNotice(message: string) {
		if (!browser) return;

		const id = nextToastId++;
		toastNotices = [{ id, message }, ...toastNotices];
		toastTimeouts.set(
			id,
			window.setTimeout(() => {
				dismissToast(id);
			}, 4000)
		);
	}

	function dismissToast(id: number) {
		const timeout = toastTimeouts.get(id);
		if (timeout) {
			window.clearTimeout(timeout);
			toastTimeouts.delete(id);
		}

		toastNotices = toastNotices.filter((toast) => toast.id !== id);
	}

	function clearAllToasts() {
		for (const timeout of toastTimeouts.values()) {
			window.clearTimeout(timeout);
		}
		toastTimeouts.clear();
		toastNotices = [];
	}

	function getErrorMessage(error: unknown, fallback: string) {
		if (error instanceof Error && error.message) {
			return error.message;
		}

		if (
			typeof error === 'object' &&
			error &&
			'message' in error &&
			typeof error.message === 'string'
		) {
			return error.message;
		}

		return fallback;
	}

	function getScopedUserId(userId: string | null = authUser?.userId ?? null) {
		return userId ?? ANONYMOUS_USERID;
	}

	function markSavedLocally() {
		if (!authUser) {
			return;
		}

		appSyncStatus = getSettledAppSyncStatus(session);
	}

	function scheduleDebouncedSync() {
		if (!authUser || !loaded) {
			return;
		}

		syncController.scheduleDebounced();
	}

	function requestImmediateSync(options: { showSuccessNotice?: boolean } = {}) {
		if (!authUser || !loaded || authBusy) {
			return;
		}

		syncController.requestImmediate({ showSuccessNotice: options.showSuccessNotice ?? false });
	}

	async function executeSync(options: { showSuccessNotice: boolean }) {
		if (!authUser || !loaded || authBusy) {
			return;
		}

		const syncSourceSession = session;
		syncBusy = true;
		appSyncStatus = isBrowserOnline() ? 'syncing' : 'offline';
		authMessage = '';

		try {
			const result = await syncUserPages(pagesApi, authUser.userId, syncSourceSession);

			if (!areEditorSessionsEquivalent(session, syncSourceSession)) {
				const reconciledSession = reconcileSyncResult(session, syncSourceSession, result.session);
				replaceLocalSession(mergeEditorSelections(reconciledSession, session), {
					persist: true,
					source: 'executeSync:reconciled-result'
				});
				syncController.queueFollowUp(options);
				return;
			}

			replaceLocalSession(mergeEditorSelections(result.session, session), {
				persist: true,
				source: 'executeSync:result'
			});

			if (options.showSuccessNotice) {
				if (result.conflictCount > 0) {
					showStatusNotice(
						result.conflictCount === 1
							? 'Sync complete with 1 conflict fork'
							: `Sync complete with ${result.conflictCount} conflict forks`
					);
				} else if (result.pushedCount === 0 && result.pulledCount === 0) {
					showStatusNotice('Sync complete (no changes)');
				} else {
					showStatusNotice('Sync complete');
				}
			}
			appSyncStatus = getSettledAppSyncStatus(session);
		} catch (error) {
			if (await account.handleAuthFailure(error)) {
				appSyncStatus = getSettledAppSyncStatus(session);
				return;
			}
			appSyncStatus = isBrowserOnline() ? 'error' : 'offline';
			authMessage = getErrorMessage(error, 'Unable to sync pages.');
		} finally {
			syncBusy = false;
		}
	}

	function handleWindowBlur() {
		requestImmediateSync();
	}

	function handleWindowOnline() {
		appSyncStatus = getSettledAppSyncStatus(session);
		requestImmediateSync();
	}

	function handleWindowBeforeUnload() {
		void persistWorkspaceState(session, session);
		requestImmediateSync();
	}
</script>

<svelte:window
	on:beforeunload={handleWindowBeforeUnload}
	on:blur={handleWindowBlur}
	on:online={handleWindowOnline}
	on:offline={handleWindowOffline}
	on:mousemove={handleMouseMove}
	on:mousedown={handleWindowPointerDown}
	on:touchstart={handleTouchStart}
	on:touchmove={handleTouchMove}
	on:touchend={handleTouchEnd}
	on:touchcancel={handleTouchEnd}
	on:keydown={handleWindowKeydown}
/>

<AppShell>
	<div class="top-chrome">
		{#if loaded && (chromeVisible || drawerOpen)}
			<button
				bind:this={drawerToggleButton}
				class="drawer-toggle"
				type="button"
				aria-label={drawerOpen ? 'Close pages' : 'Open pages'}
				aria-expanded={drawerOpen}
				on:click={() => (drawerOpen = !drawerOpen)}
			>
				<Icon name={drawerOpen ? 'x-mark' : 'bars-3'} />
			</button>
		{/if}

		<div
			class:count-visible={countVisible}
			class:docked-right={countDockedRight}
			class="count-shell"
		>
			{#if countVisibleInChrome}
				<div class="count-control" transition:fade={{ duration: 160 }}>
					<button
						bind:this={countButton}
						class="count-toggle"
						type="button"
						aria-haspopup="menu"
						aria-expanded={countMenuOpen}
						aria-label={`Open count menu, currently showing ${currentCountLabel}`}
						tabindex={countVisible ? 0 : -1}
						on:click={toggleCountMenu}
					>
						{currentCountLabel}
					</button>
					{#if countMenuOpen}
						<FloatingMenu label="Count display options" verticalOffset="var(--space-2)">
							{#if isMobileViewport}
								{#each MOBILE_COUNT_OPTIONS as option (option.id)}
									<button
										type="button"
										role="menuitemradio"
										aria-checked={option.id === mobileCountVisibility}
										on:click={() => selectMobileCountVisibility(option.id)}
									>
										{option.label}
									</button>
								{/each}
							{:else}
								{#each countOptions as option (option.id)}
									<button
										type="button"
										role="menuitemradio"
										aria-checked={option.id === countDisplayMode}
										on:click={() => selectCountDisplay(option.id)}
									>
										{option.label}
									</button>
								{/each}
							{/if}
						</FloatingMenu>
					{/if}
				</div>
			{/if}
		</div>

		<Navbar visible={loaded && chromeVisible && !drawerOpen}>
			<div class="settings-control">
				<button
					bind:this={settingsButton}
					class="settings-toggle"
					type="button"
					aria-haspopup="menu"
					aria-expanded={settingsMenuOpen}
					aria-label="Open editor settings"
					on:click={toggleSettingsMenu}
				>
					<Icon name="ellipsis-horizontal" />
				</button>
				{#if settingsMenuOpen}
					<FloatingMenu label="Editor settings" verticalOffset="var(--space-2)">
						<button type="button" on:click={toggleThemeMode}>
							{preferences.themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
						</button>
						<button type="button" on:click={toggleSpellcheck}>
							{preferences.spellcheckEnabled ? 'Spellcheck on' : 'Spellcheck off'}
						</button>
						<button
							type="button"
							aria-label={`Cycle word count visibility, currently ${getCountVisibilityLabel(preferences.countVisibility).toLowerCase()}`}
							on:click={cycleWordCountVisibility}
						>
							{isMobileViewport
								? preferences.countVisibility === 'hidden'
									? 'Count hidden'
									: 'Count shown'
								: getCountVisibilityLabel(preferences.countVisibility)}
						</button>
						{#if authUser}
							<button
								type="button"
								disabled={authBusy || syncBusy || appSyncStatus === 'offline'}
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
							<button type="button" disabled={authBusy} on:click={openLoginOrAccountList}>
								Login
							</button>
						{/if}
						{#if authMessage && !loginModalOpen}
							<div class="menu-stat">{authMessage}</div>
						{/if}
					</FloatingMenu>
				{/if}
			</div>
		</Navbar>
	</div>

	{#if drawerOpen}
		<button
			class="scrim"
			type="button"
			aria-label="Close pages"
			on:click={() => {
				drawerOpen = false;
				menuPageId = null;
			}}
		></button>
	{/if}

	{#if deletePage}
		<ConfirmModal
			title="Delete page?"
			message={deletePage.title}
			actionLabel="Delete"
			danger
			onCancel={closeDeleteModal}
			onConfirm={() => closePage(deletePage.id)}
		/>
	{/if}

	{#if loginModalOpen}
		<LoginModal
			step={loginStep}
			email={emailDraft}
			otp={otpDraft}
			message={authMessage}
			{loginSubmitting}
			{otpVerifying}
			{otpShake}
			{resendCooldownRemaining}
			onClose={closeLoginModal}
			onSubmitEmail={(email) => void submitLogin(email)}
			onVerifyOtp={(code) => void verifyOtpCode(code)}
			onResendOtp={resendOtpCode}
			onBackToEmail={() => {
				loginStep = 'email';
				otpDraft = '';
				authMessage = '';
			}}
		/>
	{/if}

	{#if accountModalOpen}
		<AccountModal
			accounts={authSessions}
			message={authMessage}
			busy={authBusy}
			{syncBusy}
			busySessionId={accountBusySessionId}
			onClose={closeAccountModal}
			onSelectAccount={(sessionId) => void selectAccountSession(sessionId)}
			onLogoutAccount={(sessionId, userId) => void logoutAccountSession(sessionId, userId)}
			onAddAccount={openLoginFlow}
		/>
	{/if}

	{#if importPromptOpen && pendingAnonymousImportSession}
		<Modal title="Add local data to this account?" dismissible={false}>
			<p>
				Do you want the notes already stored on this device added to this account's local workspace?
			</p>
			<svelte:fragment slot="actions">
				<Button disabled={authBusy} on:click={() => resolveAnonymousImport(false)}>No</Button>
				<Button variant="primary" disabled={authBusy} on:click={() => resolveAnonymousImport(true)}>
					Yes
				</Button>
			</svelte:fragment>
		</Modal>
	{/if}

	<Sidebar
		open={drawerOpen}
		label="Pages"
		mobileFullScreen
		ariaHidden={!drawerOpen}
		inert={!drawerOpen}
	>
		<div class="drawer-header">
			<h1>Pages</h1>
			<button type="button" class="add-page" aria-label="New page" on:click={addPage}>+</button>
		</div>

		<nav class="page-list" aria-label="Page tabs">
			{#each visiblePages as page (page.id)}
				<div class:active={page.id === session.activePageId} class="page-row">
					{#if editingPageId === page.id}
						<div class="page-tab page-tab-editing">
							<input
								bind:this={titleInput}
								bind:value={titleDraft}
								class="title-input"
								type="text"
								aria-label="Edit page title"
								on:blur={cancelTitleEdit}
								on:keydown={(event) => {
									if (event.key === 'Enter') {
										event.preventDefault();
										confirmTitleEdit();
									}
									if (event.key === 'Escape') {
										event.preventDefault();
										cancelTitleEdit();
									}
								}}
							/>
							<button
								type="button"
								class="confirm-title"
								aria-label="Confirm title"
								on:mousedown|preventDefault={() => {}}
								on:click={confirmTitleEdit}
							>
								✓
							</button>
						</div>
					{:else}
						<button type="button" class="page-tab" on:click={() => selectPage(page.id)}>
							<span class="page-title">{page.title}</span>
						</button>
					{/if}
					<div class="page-actions">
						<button
							type="button"
							class="menu-toggle"
							aria-label={`Page menu for ${page.title}`}
							aria-expanded={menuPageId === page.id}
							on:click={() => toggleMenu(page.id)}
						>
							<Icon name="ellipsis-horizontal" />
						</button>
						{#if menuPageId === page.id}
							<FloatingMenu label={`Page menu for ${page.title}`}>
								<button type="button" on:click={() => startEditingTitle(page.id)}>Edit title</button
								>
								<button type="button" on:click={() => openDeleteModal(page.id)}>Delete</button>
							</FloatingMenu>
						{/if}
					</div>
				</div>
			{/each}
		</nav>
	</Sidebar>

	<section class="workspace" bind:this={workspaceSection} tabindex="-1">
		{#if loaded}
			{#key activePage.id}
				<Editor
					pageId={activePage.id}
					initialState={{
						text: activePage.content,
						selectionStart: activePage.selectionStart,
						selectionEnd: activePage.selectionEnd
					}}
					spellcheckEnabled={preferences.spellcheckEnabled}
					onFocusChange={handleEditorFocusChange}
					onChange={updateActivePage}
				/>
			{/key}
		{/if}
	</section>

	{#if toastNotices.length > 0}
		<div class="toast-stack" aria-live="polite" aria-atomic="false">
			{#each toastNotices as toast (toast.id)}
				<button type="button" class="toast" on:click={() => dismissToast(toast.id)}>
					<span class="toast-message">{toast.message}</span>
				</button>
			{/each}
		</div>
	{/if}
</AppShell>

<style>
	.top-chrome {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 30;
		pointer-events: none;
	}

	.top-chrome .drawer-toggle,
	.top-chrome .count-shell {
		pointer-events: auto;
	}

	.top-chrome :global(.navbar-shell),
	.top-chrome :global(.navbar) {
		pointer-events: none;
	}

	:global(body) {
		margin: 0;
		background-color: var(--color-bg);
		color: var(--color-fg);
		font-family: var(--font-family-mono);
		transition: var(--theme-transition);
	}

	.toast-stack {
		position: fixed;
		top: max(
			calc(var(--space-8) + var(--space-1)),
			calc(env(safe-area-inset-top) + var(--space-7))
		);
		right: max(var(--space-4), env(safe-area-inset-right));
		z-index: 40;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-3);
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		max-width: min(22rem, calc(100vw - 2rem));
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background-color: var(--color-panel);
		color: var(--color-fg);
		box-shadow: 0 18px 38px -24px var(--color-shadow);
		backdrop-filter: blur(12px);
		cursor: pointer;
		text-align: left;
		white-space: normal;
		font: inherit;
		font-family: inherit;
		appearance: none;
		-webkit-appearance: none;
		transition: var(--theme-transition);
	}

	.toast-message {
		min-width: 0;
		flex: 1;
		font-size: var(--font-size-md);
		line-height: var(--line-height-tight);
	}

	.settings-control,
	.count-shell {
		position: absolute;
		top: 0;
		right: 0;
	}

	.settings-control {
		pointer-events: auto;
	}

	.count-control {
		position: relative;
		min-width: 0;
	}

	.count-shell {
		z-index: 21;
		padding: max(var(--space-3), env(safe-area-inset-top))
			max(var(--space-3), env(safe-area-inset-right)) 0
			max(var(--space-3), env(safe-area-inset-left));
		opacity: 0;
		pointer-events: none;
		transform: translateX(-2.5rem);
		transition:
			opacity var(--duration-normal) var(--ease-standard),
			transform var(--duration-slow) var(--ease-standard);
	}

	.count-shell.count-visible {
		opacity: 1;
		pointer-events: auto;
	}

	.count-shell.docked-right {
		transform: translateX(0);
	}

	.count-toggle,
	.settings-toggle {
		position: static;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.count-toggle {
		display: block;
		min-height: 2rem;
		max-width: min(12rem, calc(100vw - 6rem));
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-1);
		font: inherit;
		font-size: var(--font-size-sm);
		letter-spacing: var(--letter-spacing-count);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count-control :global(.floating-menu) {
		min-width: max-content;
	}

	.count-control :global(.floating-menu button),
	.count-control :global(.floating-menu .menu-stat) {
		text-align: right;
	}

	.count-control :global(.floating-menu button[aria-checked='true']) {
		color: var(--color-subtle);
	}

	.drawer-toggle {
		position: absolute;
		top: max(var(--space-3), env(safe-area-inset-top));
		left: max(var(--space-3), env(safe-area-inset-left));
		z-index: 22;
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
	}

	.drawer-toggle :global(svg) {
		width: 1.1rem;
		height: 1.1rem;
		color: var(--color-fg);
	}

	.settings-toggle {
		width: 2rem;
		height: 2rem;
		padding: 0;
		border-radius: var(--radius-1);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
	}

	.drawer-toggle:hover,
	.drawer-toggle:focus-visible,
	.count-toggle:hover,
	.count-toggle:focus-visible,
	.settings-toggle:hover,
	.settings-toggle:focus-visible {
		background-color: var(--color-hover);
	}

	.settings-toggle :global(svg) {
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

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}

	.drawer-header h1 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-normal);
	}

	.add-page,
	.page-tab,
	.menu-toggle,
	.confirm-title {
		border: 0;
		background: transparent;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}

	.add-page,
	.menu-toggle {
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border-radius: var(--radius-1);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.page-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.page-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		border-radius: var(--radius-1);
	}

	.page-row.active {
		background-color: var(--color-hover);
		transition: var(--theme-transition);
	}

	.page-tab {
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		text-align: left;
	}

	.page-tab-editing {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		padding: var(--space-3) var(--space-2) var(--space-3) var(--space-3);
		gap: var(--space-1);
	}

	.page-title {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-size-md);
	}

	.page-actions {
		position: relative;
		display: flex;
		align-items: center;
	}

	.menu-toggle {
		border-radius: var(--radius-1);
	}

	.add-page:hover,
	.add-page:focus-visible,
	.menu-toggle:hover,
	.menu-toggle:focus-visible {
		background-color: var(--color-hover);
	}

	.menu-toggle :global(svg) {
		color: var(--color-fg);
		fill: currentColor;
	}

	.title-input {
		min-width: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--font-size-md);
	}

	.confirm-title {
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border-radius: var(--radius-round);
	}

	.workspace {
		min-height: 100vh;
	}
</style>
