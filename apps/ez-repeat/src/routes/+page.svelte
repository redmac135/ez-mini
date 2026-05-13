<script lang="ts">
	import { onMount } from 'svelte';
	import { AppShell, Button, FloatingMenu, Icon, Navbar } from '@ez/ui';
	import CalendarDrawer from '$lib/components/CalendarDrawer.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import DateNavigator from '$lib/components/DateNavigator.svelte';
	import HabitCreateModal from '$lib/components/HabitCreateModal.svelte';
	import HabitList from '$lib/components/HabitList.svelte';
	import { createRepeatController, type RepeatViewModel, type ThemeMode } from '$lib';
	import type { HabitProgress, ParsedHabitInput } from '$lib/repeat/types';

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

	onMount(() => {
		void repeat.load();

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
		return () => window.removeEventListener('pointerdown', handlePointerDown);
	});

	$: applyTheme(view?.themeMode ?? 'light');

	function applyTheme(themeMode: ThemeMode) {
		if (typeof document === 'undefined') {
			return;
		}

		document.body.dataset.theme = themeMode;
	}

	async function createHabit(parsed: ParsedHabitInput) {
		await repeat.createHabit(parsed);
		addModalOpen = false;
	}

	async function editHabit(parsed: ParsedHabitInput) {
		if (!editHabitProgress) {
			return;
		}

		await repeat.editHabit(editHabitProgress.habit.id, parsed);
		editHabitProgress = null;
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
	}

	async function toggleTheme() {
		await repeat.setThemeMode(view.themeMode === 'dark' ? 'light' : 'dark');
		settingsMenuOpen = false;
	}
</script>

<svelte:head>
	<title>ez-repeat</title>
</svelte:head>

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
						<button
							type="button"
							on:click={async () => {
								await repeat.resetDemoData();
								settingsMenuOpen = false;
							}}
						>
							Reset demo data
						</button>
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
				onComplete={repeat.addCompletion}
				onUndo={repeat.undoCompletion}
				onEdit={(progress) => (editHabitProgress = progress)}
				onArchive={(progress) => (confirmAction = { type: 'archive', progress })}
				onDelete={(progress) => (confirmAction = { type: 'delete', progress })}
			/>
		{/if}
	</main>

	{#if addModalOpen}
		<HabitCreateModal onCancel={() => (addModalOpen = false)} onCreate={createHabit} />
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

	.workspace {
		width: min(680px, calc(100vw - 2rem));
		min-height: 100vh;
		box-sizing: border-box;
		margin: 0 auto;
		padding: calc(var(--space-8) + env(safe-area-inset-top)) 0 var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		font-family: var(--font-family-mono);
	}

	@media (max-width: 560px) {
		.workspace {
			width: min(100% - 1rem, 680px);
			padding-top: calc(var(--space-8) + var(--space-2) + env(safe-area-inset-top));
			gap: var(--space-4);
		}
	}
</style>
