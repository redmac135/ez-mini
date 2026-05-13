<script lang="ts">
	import { Button, Chip, FloatingMenu, Modal, TextInput } from '@ez/ui';
	import { formatFrequency, formatRecurrence, parseHabitInput } from '$lib/repeat/parser';
	import type { HabitRecurrence, ParsedHabitInput, Weekday } from '$lib/repeat/types';

	export let title = 'New habit';
	export let submitLabel = 'Create';
	export let initialValue = '';
	export let initialTargetCount: number | null = null;
	export let initialRecurrence: HabitRecurrence | null = null;
	export let disclaimer = '';
	export let onCancel: () => void = () => {};
	export let onCreate: (parsed: ParsedHabitInput) => void = () => {};

	let input = initialValue;
	let manualTargetCount: number | null = initialTargetCount;
	let manualRecurrence: HabitRecurrence | null = initialRecurrence;
	let openMenu: 'frequency' | 'recurrence' | null = null;
	let recurrenceMode: HabitRecurrence['type'] = 'days';
	let selectedDays: Weekday[] = [1, 3, 5];

	$: parsedInput = parseHabitInput(input);
	$: parsed = {
		title: parsedInput.title,
		targetCount: manualTargetCount ?? parsedInput.targetCount,
		recurrence: manualRecurrence ?? parsedInput.recurrence
	};

	function submit() {
		onCreate(parsed);
	}

	function setTargetCount(targetCount: number) {
		manualTargetCount = targetCount;
		openMenu = null;
	}

	function setRecurrence(recurrence: HabitRecurrence) {
		manualRecurrence = recurrence;
		openMenu = null;
	}

	function toggleRecurrenceMenu() {
		if (openMenu === 'recurrence') {
			openMenu = null;
			return;
		}

		recurrenceMode = parsed.recurrence.type;
		if (parsed.recurrence.type === 'daysOfWeek' && parsed.recurrence.days.length > 0) {
			selectedDays = parsed.recurrence.days;
		}
		openMenu = 'recurrence';
	}

	function toggleDay(day: Weekday) {
		const next = selectedDays.includes(day)
			? selectedDays.filter((selectedDay) => selectedDay !== day)
			: [...selectedDays, day].sort((left, right) => left - right);
		selectedDays = next.length > 0 ? next : [day];
	}
</script>

<Modal {title} onClose={onCancel}>
	<form class="create-form" on:submit|preventDefault={submit}>
		{#if disclaimer}
			<p class="disclaimer">{disclaimer}</p>
		{/if}
		<TextInput bind:value={input} placeholder="morning stretch twice a day" ariaLabel="Habit" />

		<div class="chips" aria-label="Parsed habit fields">
			<div class="chip-control">
				<Chip
					selected={openMenu === 'frequency'}
					on:click={() => (openMenu = openMenu === 'frequency' ? null : 'frequency')}
				>
					{formatFrequency(parsed.targetCount)}
				</Chip>
				{#if openMenu === 'frequency'}
					<FloatingMenu label="Habit frequency">
						{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as count (count)}
							<button type="button" on:click={() => setTargetCount(count)}>{count}x</button>
						{/each}
					</FloatingMenu>
				{/if}
			</div>

			<div class="chip-control">
				<Chip selected={openMenu === 'recurrence'} on:click={toggleRecurrenceMenu}>
					{formatRecurrence(parsed.recurrence)}
				</Chip>
				{#if openMenu === 'recurrence'}
					<FloatingMenu label="Habit recurrence">
						<div class="recurrence-menu">
							<div class="segmented">
								<button
									class:active={recurrenceMode === 'days'}
									type="button"
									on:click={() => (recurrenceMode = 'days')}
								>
									Days
								</button>
								<button
									class:active={recurrenceMode === 'weeks'}
									type="button"
									on:click={() => (recurrenceMode = 'weeks')}
								>
									Weeks
								</button>
								<button
									class:active={recurrenceMode === 'daysOfWeek'}
									type="button"
									on:click={() => (recurrenceMode = 'daysOfWeek')}
								>
									Days
								</button>
							</div>

							{#if recurrenceMode === 'days'}
								<button type="button" on:click={() => setRecurrence({ type: 'days', interval: 1 })}>
									Daily
								</button>
								<button type="button" on:click={() => setRecurrence({ type: 'days', interval: 2 })}>
									2 days
								</button>
								<button type="button" on:click={() => setRecurrence({ type: 'days', interval: 3 })}>
									3 days
								</button>
							{:else if recurrenceMode === 'weeks'}
								<button
									type="button"
									on:click={() => setRecurrence({ type: 'weeks', interval: 1 })}
								>
									Weekly
								</button>
								<button
									type="button"
									on:click={() => setRecurrence({ type: 'weeks', interval: 2 })}
								>
									2 weeks
								</button>
								<button
									type="button"
									on:click={() => setRecurrence({ type: 'weeks', interval: 3 })}
								>
									3 weeks
								</button>
							{:else}
								<div class="day-grid">
									{#each [{ label: 'S', value: 0 }, { label: 'M', value: 1 }, { label: 'T', value: 2 }, { label: 'W', value: 3 }, { label: 'T', value: 4 }, { label: 'F', value: 5 }, { label: 'S', value: 6 }] as day (day.value)}
										<button
											class:active={selectedDays.includes(day.value as Weekday)}
											type="button"
											on:click={() => toggleDay(day.value as Weekday)}
										>
											{day.label}
										</button>
									{/each}
								</div>
								<button
									type="button"
									on:click={() =>
										setRecurrence({ type: 'daysOfWeek', days: selectedDays, interval: 1 })}
								>
									Every week
								</button>
								<button
									type="button"
									on:click={() =>
										setRecurrence({ type: 'daysOfWeek', days: selectedDays, interval: 2 })}
								>
									Every other week
								</button>
							{/if}
						</div>
					</FloatingMenu>
				{/if}
			</div>
		</div>
	</form>

	<svelte:fragment slot="actions">
		<Button on:click={onCancel}>Cancel</Button>
		<Button variant="primary" on:click={submit}>{submitLabel}</Button>
	</svelte:fragment>
</Modal>

<style>
	.create-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip-control {
		position: relative;
	}

	.disclaimer {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-size-md);
		line-height: var(--line-height-tight);
	}

	.recurrence-menu {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 12rem;
	}

	.segmented,
	.day-grid {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-1);
	}

	.segmented {
		grid-template-columns: repeat(3, 1fr);
	}

	.day-grid {
		grid-template-columns: repeat(7, 1fr);
	}

	.segmented button,
	.day-grid button {
		text-align: center;
	}

	.active {
		background: var(--color-hover) !important;
		color: var(--color-fg) !important;
	}
</style>
