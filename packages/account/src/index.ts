import type { AuthClient, AuthSessionResponse, AuthSessionSummary } from '@ez/auth';

export type LoginStep = 'email' | 'otp';
export type AccountPhase = 'idle' | 'loading-session' | 'loading-data' | 'ready' | 'error';

export interface AccountDataAdapter<TData> {
	loadAnonymous(): Promise<TData>;
	loadAccount(user: AuthSessionSummary): Promise<TData>;
	deleteAccountData?(userId: string): Promise<void>;
	subscribeToDataChanges?(
		scope: { userId: string | null },
		refresh: () => void
	): (() => void) | void;
	onLoaded?(state: {
		user: AuthSessionSummary | null;
		data: TData;
		pulledRemoteChanges: boolean;
	}): void;
}

export interface AccountControllerState<TData> {
	user: AuthSessionSummary | null;
	sessions: AuthSessionSummary[];
	data: TData | null;
	phase: AccountPhase;
	authBusy: boolean;
	accountBusySessionId: string | null;
	authMessage: string;
	loginModalOpen: boolean;
	accountModalOpen: boolean;
	loginStep: LoginStep;
	emailDraft: string;
	otpDraft: string;
	loginSubmitting: boolean;
	otpVerifying: boolean;
	otpShake: boolean;
	resendCooldownRemaining: number;
}

export interface AccountControllerOptions<TData> {
	authClient: AuthClient | null;
	adapter: AccountDataAdapter<TData>;
	channelName?: string;
	tabId?: string;
	resendCooldownSeconds?: number;
	getErrorMessage?: (error: unknown, fallback: string) => string;
	onAuthChanged?: (user: AuthSessionSummary | null) => void;
}

export interface AccountController<TData> {
	subscribe(run: (state: AccountControllerState<TData>) => void): () => void;
	getState(): AccountControllerState<TData>;
	initialize(options?: { initialUser?: AuthSessionSummary | null }): Promise<void>;
	openLoginFlow(): void;
	openLoginOrAccountList(): Promise<void>;
	closeLoginModal(): void;
	closeAccountModal(): void;
	submitLogin(email?: string): Promise<void>;
	verifyOtpCode(code: string): Promise<void>;
	resendOtpCode(): Promise<void>;
	backToEmail(): void;
	selectAccountSession(sessionId: string): Promise<void>;
	logoutAccountSession(sessionId: string, userId: string): Promise<void>;
	logoutCurrentAccount(): Promise<void>;
	refresh(): Promise<void>;
	destroy(): void;
}

const DEFAULT_CHANNEL_NAME = 'auth';
const DEFAULT_RESEND_COOLDOWN_SECONDS = 30;

export function createAccountDataController<TData>(
	options: AccountControllerOptions<TData>
): AccountController<TData> {
	const getErrorMessage = options.getErrorMessage ?? defaultGetErrorMessage;
	const resendCooldownSeconds = options.resendCooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS;
	const tabId = options.tabId ?? createTabId();
	let state: AccountControllerState<TData> = {
		user: null,
		sessions: [],
		data: null,
		phase: 'idle',
		authBusy: false,
		accountBusySessionId: null,
		authMessage: '',
		loginModalOpen: false,
		accountModalOpen: false,
		loginStep: 'email',
		emailDraft: '',
		otpDraft: '',
		loginSubmitting: false,
		otpVerifying: false,
		otpShake: false,
		resendCooldownRemaining: 0
	};
	const subscribers = new Set<(state: AccountControllerState<TData>) => void>();
	let requestId = 0;
	let unsubscribeDataChanges: (() => void) | null = null;
	let resendCooldownInterval: ReturnType<typeof setInterval> | null = null;
	let authChannel: BroadcastChannel | null = null;
	let destroyed = false;

	function subscribe(run: (state: AccountControllerState<TData>) => void) {
		subscribers.add(run);
		run(state);
		return () => {
			subscribers.delete(run);
		};
	}

	function setState(next: Partial<AccountControllerState<TData>>) {
		state = { ...state, ...next };
		for (const subscriber of subscribers) {
			subscriber(state);
		}
	}

	function getState() {
		return state;
	}

	async function initialize(initOptions: { initialUser?: AuthSessionSummary | null } = {}) {
		openAuthChannel();
		if (initOptions.initialUser !== undefined) {
			setState({ user: initOptions.initialUser });
			options.onAuthChanged?.(initOptions.initialUser);
		}

		if (!options.authClient) {
			await loadDataForUser(null, { setBusy: false });
			return;
		}

		const nextRequestId = beginRequest();
		setState({ authBusy: true, phase: 'loading-session', authMessage: '' });
		try {
			const response = await options.authClient.getSession();
			if (!isLatest(nextRequestId)) return;
			await applyAuthResponse(response, { broadcast: false, requestId: nextRequestId });
		} catch (error) {
			if (!isLatest(nextRequestId)) return;
			setState({
				authBusy: false,
				phase: 'error',
				authMessage: getErrorMessage(error, 'Unable to load session.')
			});
		}
	}

	function openLoginFlow() {
		setState({
			accountModalOpen: false,
			loginModalOpen: true,
			loginStep: 'email',
			otpDraft: '',
			authMessage: ''
		});
	}

	async function openLoginOrAccountList() {
		if (!options.authClient) {
			setState({ authMessage: 'Sync is not configured.' });
			return;
		}

		setState({ authBusy: true, authMessage: '' });
		let openedModal = false;
		try {
			const response = await options.authClient.getSession();
			if (response.sessions.length > 0) {
				setState({
					sessions: response.sessions,
					accountModalOpen: true,
					loginModalOpen: false
				});
			} else {
				setState({ sessions: response.sessions });
				openLoginFlow();
			}
			openedModal = true;
		} catch (error) {
			setState({ authMessage: getErrorMessage(error, 'Unable to load accounts.') });
		} finally {
			setState({ authBusy: false });
			void openedModal;
		}
	}

	function closeLoginModal() {
		if (state.loginSubmitting || state.otpVerifying) return;
		stopResendCooldown();
		setState({
			loginModalOpen: false,
			loginStep: 'email',
			otpDraft: '',
			authMessage: ''
		});
	}

	function closeAccountModal() {
		if (state.authBusy || state.accountBusySessionId) return;
		setState({ accountModalOpen: false });
	}

	async function submitLogin(email = state.emailDraft) {
		if (!options.authClient) {
			setState({ authMessage: 'Sync is not configured.' });
			return;
		}

		const trimmedEmail = email.trim();
		setState({ emailDraft: email });
		if (!trimmedEmail) {
			setState({ authMessage: 'Enter an email address.' });
			return;
		}

		setState({ loginSubmitting: true, authMessage: '' });
		try {
			await options.authClient.login(trimmedEmail);
			setState({
				loginSubmitting: false,
				loginStep: 'otp',
				otpDraft: ''
			});
			startResendCooldown();
		} catch (error) {
			setState({
				loginSubmitting: false,
				authMessage: getErrorMessage(error, 'Unable to send login code.')
			});
		}
	}

	async function verifyOtpCode(code: string) {
		if (!options.authClient || state.otpVerifying || code.length !== 8) return;

		setState({ otpVerifying: true, authMessage: '' });
		try {
			const response = await options.authClient.verify(state.emailDraft.trim(), code);
			stopResendCooldown();
			setState({
				otpVerifying: false,
				loginModalOpen: false,
				accountModalOpen: false,
				loginStep: 'email',
				otpDraft: ''
			});
			await applyAuthResponse(response);
		} catch (error) {
			setState({
				otpVerifying: false,
				otpDraft: '',
				authMessage: getErrorMessage(error, 'Unable to verify code.')
			});
			triggerOtpShake();
		}
	}

	async function resendOtpCode() {
		if (
			!options.authClient ||
			state.resendCooldownRemaining > 0 ||
			state.loginSubmitting ||
			state.otpVerifying
		) {
			return;
		}

		setState({ loginSubmitting: true, authMessage: '' });
		try {
			await options.authClient.login(state.emailDraft.trim());
			startResendCooldown();
			setState({ loginSubmitting: false, authMessage: 'A new code was sent.' });
		} catch (error) {
			setState({
				loginSubmitting: false,
				authMessage: getErrorMessage(error, 'Unable to resend code.')
			});
		}
	}

	function backToEmail() {
		setState({ loginStep: 'email', otpDraft: '', authMessage: '' });
	}

	async function selectAccountSession(sessionId: string) {
		if (!options.authClient || state.authBusy || state.accountBusySessionId) return;
		if (state.sessions.find((entry) => entry.sessionId === sessionId)?.active) {
			setState({ accountModalOpen: false });
			return;
		}

		setState({ authBusy: true, accountBusySessionId: sessionId, authMessage: '' });
		try {
			const response = await options.authClient.switchSession(sessionId);
			await applyAuthResponse(response);
			setState({ accountModalOpen: false });
		} catch (error) {
			setState({ authMessage: getErrorMessage(error, 'Unable to switch accounts.') });
		} finally {
			setState({ authBusy: false, accountBusySessionId: null });
		}
	}

	async function logoutCurrentAccount() {
		if (!state.user) return;
		await logoutAccountSession(state.user.sessionId, state.user.userId);
	}

	async function logoutAccountSession(sessionId: string, userId: string) {
		if (!options.authClient || state.authBusy || state.accountBusySessionId) return;

		const previousActiveUserId = state.user?.userId ?? null;
		const wasActiveAccount = previousActiveUserId === userId;
		setState({
			authBusy: wasActiveAccount,
			accountBusySessionId: sessionId,
			authMessage: ''
		});
		try {
			const response = await options.authClient.logout({ sessionId });
			await options.adapter.deleteAccountData?.(userId);
			if (wasActiveAccount || response.activeSession?.userId !== previousActiveUserId) {
				await applyAuthResponse(response);
			} else {
				setState({ sessions: response.sessions });
			}
		} catch (error) {
			setState({ authMessage: getErrorMessage(error, 'Unable to logout.') });
		} finally {
			setState({
				authBusy: false,
				accountBusySessionId: null,
				accountModalOpen: state.sessions.length > 0 ? state.accountModalOpen : false
			});
		}
	}

	async function refresh() {
		await loadDataForUser(state.user, { setBusy: false });
	}

	async function applyAuthResponse(
		response: AuthSessionResponse,
		applyOptions: { broadcast?: boolean; requestId?: number } = {}
	) {
		const nextUser = response.activeSession ?? null;
		setState({ sessions: response.sessions, user: nextUser, authMessage: '' });
		options.onAuthChanged?.(nextUser);
		if (applyOptions.broadcast !== false) {
			broadcastAuthSessionChanged(nextUser?.userId ?? null);
		}
		await loadDataForUser(nextUser, {
			requestId: applyOptions.requestId,
			setBusy: !!nextUser
		});
	}

	async function loadDataForUser(
		user: AuthSessionSummary | null,
		loadOptions: { requestId?: number; setBusy?: boolean } = {}
	) {
		const nextRequestId = loadOptions.requestId ?? beginRequest();
		if (loadOptions.setBusy) {
			setState({ authBusy: true });
		}
		setState({ user, phase: 'loading-data' });
		options.onAuthChanged?.(user);
		resubscribeToDataChanges(user);

		try {
			const data = user
				? await options.adapter.loadAccount(user)
				: await options.adapter.loadAnonymous();
			if (!isLatest(nextRequestId)) return;
			setState({
				user,
				data,
				phase: 'ready',
				authBusy: false,
				authMessage: ''
			});
			options.adapter.onLoaded?.({ user, data, pulledRemoteChanges: hasPulledRemoteChanges(data) });
		} catch (error) {
			if (!isLatest(nextRequestId)) return;
			setState({
				phase: 'error',
				authBusy: false,
				authMessage: getErrorMessage(
					error,
					user ? 'Unable to load account data.' : 'Unable to load local data.'
				)
			});
		}
	}

	function resubscribeToDataChanges(user: AuthSessionSummary | null) {
		unsubscribeDataChanges?.();
		unsubscribeDataChanges = null;
		const unsubscribe = options.adapter.subscribeToDataChanges?.(
			{ userId: user?.userId ?? null },
			() => {
				void refresh();
			}
		);
		unsubscribeDataChanges = unsubscribe ?? null;
	}

	function openAuthChannel() {
		if (typeof BroadcastChannel === 'undefined') return;
		authChannel?.close();
		authChannel = new BroadcastChannel(options.channelName ?? DEFAULT_CHANNEL_NAME);
		authChannel.onmessage = (event) => {
			const message = event.data as {
				type?: unknown;
				sourceTabId?: unknown;
				userId?: unknown;
			} | null;
			if (!message || message.type !== 'auth-session-updated' || message.sourceTabId === tabId) {
				return;
			}

			const currentUserId = state.user?.userId ?? null;
			if (message.userId === currentUserId) {
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
		if (!options.authClient) return;
		try {
			await applyAuthResponse(await options.authClient.getSession(), { broadcast: false });
		} catch (error) {
			void error;
		}
	}

	function beginRequest() {
		requestId += 1;
		return requestId;
	}

	function isLatest(nextRequestId: number) {
		return !destroyed && requestId === nextRequestId;
	}

	function startResendCooldown() {
		stopResendCooldown();
		setState({ resendCooldownRemaining: resendCooldownSeconds });
		resendCooldownInterval = setInterval(() => {
			const nextRemaining = Math.max(0, state.resendCooldownRemaining - 1);
			setState({ resendCooldownRemaining: nextRemaining });
			if (nextRemaining === 0) {
				stopResendCooldown();
			}
		}, 1000);
	}

	function stopResendCooldown() {
		if (resendCooldownInterval) {
			clearInterval(resendCooldownInterval);
			resendCooldownInterval = null;
		}
		if (state.resendCooldownRemaining !== 0) {
			setState({ resendCooldownRemaining: 0 });
		}
	}

	function triggerOtpShake() {
		setState({ otpShake: false });
		const frame =
			typeof requestAnimationFrame === 'function'
				? requestAnimationFrame
				: (callback: FrameRequestCallback) => setTimeout(callback, 0);
		frame(() => {
			setState({ otpShake: true });
			setTimeout(() => {
				if (!destroyed) {
					setState({ otpShake: false });
				}
			}, 300);
		});
	}

	function destroy() {
		destroyed = true;
		stopResendCooldown();
		unsubscribeDataChanges?.();
		unsubscribeDataChanges = null;
		authChannel?.close();
		authChannel = null;
		subscribers.clear();
	}

	return {
		subscribe,
		getState,
		initialize,
		openLoginFlow,
		openLoginOrAccountList,
		closeLoginModal,
		closeAccountModal,
		submitLogin,
		verifyOtpCode,
		resendOtpCode,
		backToEmail,
		selectAccountSession,
		logoutAccountSession,
		logoutCurrentAccount,
		refresh,
		destroy
	};
}

function createTabId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultGetErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}

function hasPulledRemoteChanges(value: unknown) {
	return (
		typeof value === 'object' &&
		value !== null &&
		'pulledRemoteChanges' in value &&
		(value as { pulledRemoteChanges?: unknown }).pulledRemoteChanges === true
	);
}
