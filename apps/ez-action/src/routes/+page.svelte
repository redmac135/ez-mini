<script lang="ts">
	import { onMount } from 'svelte';
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
		Sidebar,
		TextInput
	} from '@ez/ui';
	import { ToastStack, createToastController } from '@ez/ui';
	import { createAccountDataController } from '@ez/account';
	import {
		createActionController,
		type ActionTask,
		type ParsedTaskInput,
		type RepeatRule
	} from '$lib';
	import { createTimestampForDate, getTodayDateKey, nextWeekdayDate } from '$lib/action/dates';
	import { formatRepeatChip, parseTaskInput } from '$lib/action/parser';
	import {
		DEFAULT_LIST_ID,
		DERIVED_PLANNED_ID,
		DERIVED_TODAY_ID,
		type Weekday
	} from '$lib/action/types';
	import QuickDateButton from '$lib/components/QuickDateButton.svelte';
	import TaskRow from '$lib/components/TaskRow.svelte';

	const action = createActionController();
	const toasts = createToastController();
	const account = createAccountDataController<null>({
		authClient: null,
		adapter: {
			async loadAnonymous() {
				await action.setUserId(null);
				return null;
			},
			async loadAccount(user) {
				await action.setUserId(user.userId);
				return null;
			}
		}
	});

	let view = $action;
	let accountState = $account;
	$: view = $action;
	$: accountState = $account;

	let drawerOpen = false;
	let settingsMenuOpen = false;
	let createInput = '';
	let chipMenu: 'repeat' | 'due' | 'planned' | null = null;
	let manualDueAt: string | null = null;
	let manualPlannedAt: string | null = null;
	let manualRepeatRule: RepeatRule | null = null;
	let editingTask: ActionTask | null = null;
	let creatingList = false;
	let listNameDraft = '';
	let editTitle = '';
	let deleteTask: ActionTask | null = null;
	let confirmListDeleteId: string | null = null;
	let menuListId: string | null = null;
	let repeatPastTaskId: string | null = null;
	let taskActionsId: string | null = null;
	let toastNotices = $toasts;
	$: toastNotices = $toasts;
	let settingsControl: HTMLDivElement | null = null;

	$: parsedInput = parseTaskInput(createInput);
	$: draftTask = {
		title: parsedInput.title,
		dueAt: manualDueAt ?? parsedInput.dueAt,
		plannedAt: manualPlannedAt ?? parsedInput.plannedAt,
		repeatRule: manualRepeatRule ?? parsedInput.repeatRule
	} satisfies ParsedTaskInput;
	$: activeTitle =
		view.activeListId === DERIVED_TODAY_ID
			? 'Today'
			: view.activeListId === DERIVED_PLANNED_ID
				? 'Planned'
				: view.activeListId === DEFAULT_LIST_ID
					? 'Tasks'
					: (view.lists.find((list) => list.id === view.activeListId)?.name ?? 'Tasks');
	$: canAdd = createInput.trim().length > 0;

	onMount(() => {
		void account.initialize();
		const unsubscribeStorage = action.subscribeToExternalChanges();
		function handlePointerDown(event: PointerEvent) {
			const target = event.target;
			if (
				target instanceof Node &&
				(settingsControl?.contains(target) ||
					(target instanceof Element &&
						target.closest('.page-actions, .composer-control, .settings-control')))
			) {
				return;
			}

			settingsMenuOpen = false;
			menuListId = null;
			chipMenu = null;
		}
		window.addEventListener('pointerdown', handlePointerDown);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			unsubscribeStorage();
			account.destroy();
			toasts.clear();
		};
	});

	$: {
		if (typeof document !== 'undefined') {
			document.body.dataset.theme = view.themeMode;
		}
	}

	async function submitTask() {
		if (!canAdd) return;
		await action.createTask(draftTask);
		createInput = '';
		manualDueAt = null;
		manualPlannedAt = null;
		manualRepeatRule = null;
		chipMenu = null;
		toasts.show('Saved locally');
	}

	function beginEditTask(task: ActionTask) {
		editingTask = task;
		editTitle = task.title;
		taskActionsId = null;
	}

	async function saveEditTask() {
		if (!editingTask) return;
		await action.updateTask(editingTask.id, { title: editTitle });
		editingTask = null;
	}

	async function completeTask(task: ActionTask) {
		if (task.completedAt) {
			await action.undoCompleteTask(task.id);
			return;
		}
		if (action.needsPastDateConfirmation(task.id)) {
			repeatPastTaskId = task.id;
			return;
		}
		await action.completeTask(task.id);
	}

	async function completePastTask(rollForwardPastDates: boolean) {
		if (repeatPastTaskId) {
			await action.completeTask(repeatPastTaskId, { rollForwardPastDates });
		}
		repeatPastTaskId = null;
	}

	async function createList() {
		await action.createList(listNameDraft);
		listNameDraft = '';
		creatingList = false;
		drawerOpen = false;
	}

	function setQuickDate(target: 'due' | 'planned', dateKey: string | null) {
		const value = dateKey ? createTimestampForDate(dateKey) : null;
		if (target === 'due') manualDueAt = value;
		if (target === 'planned') manualPlannedAt = value;
		chipMenu = null;
	}

	function nextWeekDate() {
		return nextWeekdayDate(getTodayDateKey(), [0]);
	}

	function getOpenTaskCount(listId: string) {
		return view.tasks.filter(
			(task) =>
				!task.completedAt &&
				!task.deletedAt &&
				!task.archivedAt &&
				(task.listId ?? DEFAULT_LIST_ID) === listId
		).length;
	}
</script>

<AppShell>
	<Navbar visible={true}>
		<div class="nav-row">
			<Button size="icon" ariaLabel="Open lists" on:click={() => (drawerOpen = true)}>
				<Icon name="bars-3" />
			</Button>
			<div class="settings-control" bind:this={settingsControl}>
				<Button
					size="icon"
					ariaLabel="Settings"
					on:click={() => (settingsMenuOpen = !settingsMenuOpen)}
				>
					<Icon name="ellipsis-horizontal" />
				</Button>
				{#if settingsMenuOpen}
					<FloatingMenu label="Settings">
						<button
							type="button"
							on:click={() => action.setThemeMode(view.themeMode === 'dark' ? 'light' : 'dark')}
						>
							{view.themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
						</button>
						<button type="button" disabled>Saved locally</button>
						<button type="button" on:click={() => account.openLoginFlow()}>Account</button>
					</FloatingMenu>
				{/if}
			</div>
		</div>
	</Navbar>

	{#if drawerOpen}
		<button
			class="scrim"
			type="button"
			aria-label="Close lists"
			on:click={() => (drawerOpen = false)}
		></button>
	{/if}

	<Sidebar
		open={drawerOpen}
		label="Task lists"
		mobileFullScreen
		ariaHidden={!drawerOpen}
		inert={!drawerOpen}
		closeLabel="Close lists"
		onClose={() => (drawerOpen = false)}
	>
		<div class="drawer-header">
			<h1>Lists</h1>
			<button
				type="button"
				class="add-page"
				aria-label="New list"
				on:click={() => (creatingList = true)}>+</button
			>
		</div>

		<nav class="page-list" aria-label="Task lists">
			<div class:active={view.activeListId === DERIVED_TODAY_ID} class="page-row">
				<button type="button" class="page-tab" on:click={() => action.selectList(DERIVED_TODAY_ID)}>
					<span class="page-title">Today</span>
				</button>
				<div class="page-actions">
					<span class="list-count">{view.todayTasks.length}</span>
				</div>
			</div>

			<div class:active={view.activeListId === DERIVED_PLANNED_ID} class="page-row">
				<button
					type="button"
					class="page-tab"
					on:click={() => action.selectList(DERIVED_PLANNED_ID)}
				>
					<span class="page-title">Planned</span>
				</button>
				<div class="page-actions">
					<span class="list-count">{view.plannedTasks.length}</span>
				</div>
			</div>

			<div class:active={view.activeListId === DEFAULT_LIST_ID} class="page-row">
				<button type="button" class="page-tab" on:click={() => action.selectList(DEFAULT_LIST_ID)}>
					<span class="page-title">Tasks</span>
				</button>
				<div class="page-actions">
					<span class="list-count">{getOpenTaskCount(DEFAULT_LIST_ID)}</span>
				</div>
			</div>

			<div class="list-separator" aria-hidden="true"></div>

			{#each view.lists as list (list.id)}
				<div class:active={view.activeListId === list.id} class="page-row">
					<button type="button" class="page-tab" on:click={() => action.selectList(list.id)}>
						<span class="page-title">{list.name}</span>
					</button>
					<div class="page-actions">
						<button
							type="button"
							class="menu-toggle"
							aria-label={`List menu for ${list.name}`}
							aria-expanded={menuListId === list.id}
							on:click={() => (menuListId = menuListId === list.id ? null : list.id)}
						>
							<Icon name="ellipsis-horizontal" />
						</button>
						{#if menuListId === list.id}
							<FloatingMenu label={`List menu for ${list.name}`}>
								<button type="button" on:click={() => action.archiveList(list.id)}>Archive</button>
								<button type="button" on:click={() => (confirmListDeleteId = list.id)}
									>Delete</button
								>
							</FloatingMenu>
						{/if}
					</div>
				</div>
			{/each}
		</nav>
	</Sidebar>

	<main class="page">
		<section class="task-panel" aria-label="Tasks">
			<h1>{activeTitle}</h1>
			<div class="task-list">
				{#if !view.loaded}
					<div class="empty-task">Loading</div>
				{:else if view.activeTasks.length === 0 && view.completedActiveTasks.length === 0}
					<div class="empty-task">No tasks</div>
				{:else}
					{#each view.activeTasks as task (task.id)}
						<TaskRow
							{task}
							actionsOpen={taskActionsId === task.id}
							onComplete={() => completeTask(task)}
							onToday={() => action.markTaskToday(task.id)}
							onOpenActions={() => (taskActionsId = taskActionsId === task.id ? null : task.id)}
							onEdit={() => beginEditTask(task)}
							onDelete={() => (deleteTask = task)}
						/>
					{/each}
					{#if view.completedActiveTasks.length > 0}
						<div class="completed-divider">
							<span>completed</span>
						</div>
						{#each view.completedActiveTasks as task (task.id)}
							<TaskRow
								{task}
								actionsOpen={taskActionsId === task.id}
								onComplete={() => completeTask(task)}
								onToday={() => action.markTaskToday(task.id)}
								onOpenActions={() => (taskActionsId = taskActionsId === task.id ? null : task.id)}
								onEdit={() => beginEditTask(task)}
								onDelete={() => (deleteTask = task)}
							/>
						{/each}
					{/if}
				{/if}
			</div>
		</section>

		<form class="composer" on:submit|preventDefault={submitTask}>
			<input
				bind:value={createInput}
				placeholder="Buy milk due tomorrow every week"
				aria-label="New task"
			/>
			<div class="composer-actions">
				<div class="composer-control">
					<Button
						size="sm"
						ariaLabel="Repeat"
						on:click={() => (chipMenu = chipMenu === 'repeat' ? null : 'repeat')}
					>
						<Icon name="repeat" />
						{#if draftTask.repeatRule}
							<span>{formatRepeatChip(draftTask.repeatRule)}</span>
						{/if}
					</Button>
					{#if chipMenu === 'repeat'}
						<FloatingMenu label="Repeat" placement="top" verticalOffset="var(--space-2)">
							<button
								type="button"
								on:click={() => {
									manualRepeatRule = null;
									chipMenu = null;
								}}>None</button
							>
							<button
								type="button"
								on:click={() => {
									manualRepeatRule = { frequency: 'daily', interval: 1 };
									chipMenu = null;
								}}>Daily</button
							>
							<button
								type="button"
								on:click={() => {
									manualRepeatRule = {
										frequency: 'weekly',
										interval: 1,
										daysOfWeek: [new Date().getDay() as Weekday]
									};
									chipMenu = null;
								}}>Weekly</button
							>
							<button
								type="button"
								on:click={() => {
									manualRepeatRule = { frequency: 'monthly', dayOfMonth: new Date().getDate() };
									chipMenu = null;
								}}>Monthly</button
							>
							<button
								type="button"
								on:click={() => {
									manualRepeatRule = {
										frequency: 'yearly',
										month: new Date().getMonth() + 1,
										dayOfMonth: new Date().getDate()
									};
									chipMenu = null;
								}}>Yearly</button
							>
						</FloatingMenu>
					{/if}
				</div>
				<QuickDateButton
					label="Due"
					value={draftTask.dueAt}
					open={chipMenu === 'due'}
					icon="calendar-days"
					onToggle={() => (chipMenu = chipMenu === 'due' ? null : 'due')}
					onSelect={(dateKey) => setQuickDate('due', dateKey)}
					{nextWeekDate}
				/>
				<QuickDateButton
					label="Planned"
					value={draftTask.plannedAt}
					open={chipMenu === 'planned'}
					icon="pencil-square"
					onToggle={() => (chipMenu = chipMenu === 'planned' ? null : 'planned')}
					onSelect={(dateKey) => setQuickDate('planned', dateKey)}
					{nextWeekDate}
				/>
				<Button variant="primary" disabled={!canAdd} on:click={submitTask}>Add</Button>
			</div>
		</form>
	</main>

	{#if editingTask}
		<Modal title="Edit task" onClose={() => (editingTask = null)}>
			<TextInput bind:value={editTitle} ariaLabel="Task title" />
			<svelte:fragment slot="actions">
				<Button on:click={() => (editingTask = null)}>Cancel</Button>
				<Button variant="primary" on:click={saveEditTask}>Save</Button>
			</svelte:fragment>
		</Modal>
	{/if}

	{#if creatingList}
		<Modal title="New list" onClose={() => (creatingList = false)}>
			<TextInput bind:value={listNameDraft} ariaLabel="List name" placeholder="List name" />
			<svelte:fragment slot="actions">
				<Button on:click={() => (creatingList = false)}>Cancel</Button>
				<Button variant="primary" disabled={!listNameDraft.trim()} on:click={createList}
					>Create</Button
				>
			</svelte:fragment>
		</Modal>
	{/if}

	{#if deleteTask}
		<ConfirmModal
			title="Delete task?"
			message="This hides the task permanently."
			actionLabel="Delete"
			danger={true}
			onCancel={() => (deleteTask = null)}
			onConfirm={async () => {
				await action.deleteTask(deleteTask!.id);
				deleteTask = null;
			}}
		/>
	{/if}

	{#if confirmListDeleteId}
		<ConfirmModal
			title="Delete list?"
			message="This deletes the list and its tasks permanently."
			actionLabel="Delete"
			danger={true}
			onCancel={() => (confirmListDeleteId = null)}
			onConfirm={async () => {
				await action.deleteList(confirmListDeleteId!);
				confirmListDeleteId = null;
			}}
		/>
	{/if}

	{#if repeatPastTaskId}
		<ConfirmModal
			title="Move repeat forward?"
			message="This task's next dates are in the past. Move the next occurrence to today or later?"
			actionLabel="Move forward"
			onCancel={() => completePastTask(false)}
			onConfirm={() => completePastTask(true)}
		/>
	{/if}

	{#if accountState.loginModalOpen}
		<LoginModal
			email={accountState.emailDraft}
			otp={accountState.otpDraft}
			step={accountState.loginStep}
			message="Remote sync is not enabled for ez-action yet."
			loginSubmitting={accountState.loginSubmitting}
			otpVerifying={accountState.otpVerifying}
			otpShake={accountState.otpShake}
			resendCooldownRemaining={accountState.resendCooldownRemaining}
			onClose={() => account.closeLoginModal()}
			onSubmitEmail={(value: string) => account.submitLogin(value)}
			onVerifyOtp={(value: string) => account.verifyOtpCode(value)}
			onResendOtp={() => account.resendOtpCode()}
			onBackToEmail={() => account.backToEmail()}
		/>
	{/if}
	{#if accountState.accountModalOpen}
		<AccountModal
			accounts={accountState.sessions}
			message={accountState.authMessage}
			busy={accountState.authBusy}
			syncBusy={false}
			busySessionId={accountState.accountBusySessionId}
			onClose={() => account.closeAccountModal()}
			onSelectAccount={(sessionId: string) => account.selectAccountSession(sessionId)}
			onLogoutAccount={(sessionId: string, userId: string) =>
				account.logoutAccountSession(sessionId, userId)}
			onAddAccount={() => account.openLoginFlow()}
		/>
	{/if}

	<ToastStack toasts={toastNotices} onDismiss={toasts.dismiss} />
</AppShell>

<style>
	.nav-row {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr) 2rem;
		align-items: center;
		gap: var(--space-3);
	}

	.settings-control,
	.composer-control {
		position: relative;
	}

	.nav-row > .settings-control {
		grid-column: 3;
		justify-self: end;
	}

	.page {
		min-height: 100vh;
		box-sizing: border-box;
		padding: 5rem max(var(--space-4), env(safe-area-inset-right)) 8rem
			max(var(--space-4), env(safe-area-inset-left));
	}

	.task-panel {
		width: min(44rem, 100%);
		margin: 0 auto;
	}

	h1 {
		margin: 0 0 var(--space-5);
		overflow: hidden;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-normal);
		line-height: var(--line-height-tight);
	}

	.task-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.empty-task {
		min-height: 3.25rem;
		box-sizing: border-box;
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-2);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-muted);
		font-size: var(--font-size-lg);
	}

	.completed-divider {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2);
		color: var(--color-muted);
		font-size: var(--font-size-sm);
	}

	.completed-divider::after {
		content: '';
		border-top: 1px solid var(--color-border);
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 10;
		border: 0;
		background-color: var(--color-scrim);
		transition: var(--theme-transition);
	}

	.composer {
		position: fixed;
		left: 50%;
		right: auto;
		bottom: max(var(--space-4), env(safe-area-inset-bottom));
		z-index: 15;
		width: min(44rem, calc(100vw - var(--space-8)));
		transform: translateX(-50%);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		box-sizing: border-box;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-2);
		background: var(--color-panel);
	}

	.composer input {
		min-width: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: inherit;
		font: inherit;
		padding: var(--space-2);
	}

	.composer-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
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
	.menu-toggle {
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

	.list-count {
		min-width: 1.75rem;
		text-align: center;
		color: var(--color-muted);
		font-size: var(--font-size-sm);
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

	.list-separator {
		border-top: 1px solid var(--color-border);
		margin: var(--space-2) 0;
	}

	@media (max-width: 560px) {
		h1 {
			font-size: var(--font-size-lg);
		}
	}
</style>
