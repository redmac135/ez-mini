<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import AppShell from '../packages/ui/src/lib/AppShell.svelte';
	import Button from '../packages/ui/src/lib/Button.svelte';
	import Icon from '../packages/ui/src/lib/Icon.svelte';
	import Navbar from '../packages/ui/src/lib/Navbar.svelte';
	import Sidebar from '../packages/ui/src/lib/Sidebar.svelte';
	import ToastStack from '../packages/ui/src/lib/ToastStack.svelte';
	import Workspace from '../packages/ui/src/lib/Workspace.svelte';
	import DateNavigator from '../apps/ez-repeat/src/lib/components/DateNavigator.svelte';
	import HabitList from '../apps/ez-repeat/src/lib/components/HabitList.svelte';
	import { Editor } from '../packages/editor/src/index.ts';

	const { Story } = defineMeta({
		title: 'Apps/Layouts',
		component: AppShell,
		parameters: { layout: 'fullscreen' }
	});

	const habit = {
		id: 'read',
		userId: 'storybook',
		title: 'Read a few pages',
		targetCount: 1,
		recurrence: { type: 'days', interval: 1 } as const,
		replacesHabitId: null,
		createdAt: '',
		updatedAt: '',
		archivedAt: null,
		deletedAt: null,
		lastSyncedAt: null
	};
	const habitProgress = [
		{ habit, count: 0, target: 1, ratio: 0, complete: false },
		{
			habit: { ...habit, id: 'stretch', title: 'Stretch' },
			count: 1,
			target: 1,
			ratio: 1,
			complete: true
		}
	];
	const savedNotices = [{ id: 1, message: 'Changes saved on this device.' }];
</script>

<script lang="ts">
	let pagesOpen = true;
	let notices = [...savedNotices];

	function togglePages() {
		pagesOpen = !pagesOpen;
	}

	function dismissNotice(id: number) {
		notices = notices.filter((notice) => notice.id !== id);
	}
</script>

<Story
	name="ez-blank writing screen"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Open pages' }));
		await expect(canvas.getByRole('complementary', { hidden: true })).not.toHaveClass('open');
	}}
>
	{#snippet template()}
		<AppShell>
			<div class="blank-screen">
				<Navbar visible>
					<div class="blank-navbar">
						<Button ariaLabel="Open pages" on:click={togglePages}><Icon name="bars-3" /></Button>
						<span>ez-blank</span>
						<Button ariaLabel="Open settings"><Icon name="ellipsis-horizontal" /></Button>
					</div>
				</Navbar>

				<Sidebar
					open={pagesOpen}
					label="Pages"
					mobileFullScreen
					ariaHidden={!pagesOpen}
					inert={!pagesOpen}
				>
					<div class="drawer-header">
						<h1>Pages</h1>
						<Button ariaLabel="New page">+</Button>
					</div>
					<nav class="page-list" aria-label="Page tabs">
						<button type="button" class="page-row active">Untitled</button>
						<button type="button" class="page-row">Ideas</button>
						<button type="button" class="page-row">Reading notes</button>
					</nav>
				</Sidebar>

				<section class="blank-workspace" aria-label="Editor">
					<Workspace maxWidth="calc(680px + var(--space-5) + var(--space-5))" topPadding="none">
						<Editor
							initialState={{
								text: '# A quiet writing space\n\nThis story composes the real Pages sidebar, navbar, and editor.',
								selectionStart: 0,
								selectionEnd: 0
							}}
						/>
					</Workspace>
				</section>
			</div>
		</AppShell>
	{/snippet}
</Story>

<Story
	name="ez-repeat daily view"
	play={async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole('button', { name: 'Changes saved on this device.' }));
		await expect(canvas.queryByText('Changes saved on this device.')).not.toBeInTheDocument();
	}}
>
	{#snippet template()}
		<AppShell>
			<div class="repeat-screen">
				<Navbar visible>
					<div class="repeat-navbar">
						<Button ariaLabel="Open calendar"><Icon name="calendar-days" /></Button>
						<div class="repeat-actions">
							<Button ariaLabel="Add habit"><Icon name="plus" /></Button>
							<Button ariaLabel="Open settings"><Icon name="ellipsis-horizontal" /></Button>
						</div>
					</div>
				</Navbar>

				<Workspace>
					<DateNavigator selectedDate="2026-10-14" todayDate="2026-10-14" />
					<HabitList progress={habitProgress} />
				</Workspace>
				<ToastStack {notices} onDismiss={dismissNotice} />
			</div>
		</AppShell>
	{/snippet}
</Story>

<style>
	.blank-screen,
	.repeat-screen {
		position: relative;
		min-height: 100vh;
		background: var(--color-bg);
		color: var(--color-fg);
		font-family: var(--font-family-mono);
	}

	.blank-navbar,
	.repeat-navbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 2.5rem;
		color: var(--color-fg);
	}

	.repeat-actions {
		display: flex;
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

	.page-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.page-row {
		padding: var(--space-3);
		border: 0;
		border-radius: var(--radius-1);
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
	}

	.page-row.active {
		background: var(--color-hover);
	}

	.blank-workspace {
		min-height: 100vh;
		box-sizing: border-box;
	}
</style>
