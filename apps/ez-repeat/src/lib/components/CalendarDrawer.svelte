<script lang="ts">
	import { tick } from 'svelte';
	import { Sidebar } from '@ez/ui';
	import CalendarMonth from './CalendarMonth.svelte';
	import {
		appendCalendarMonthKeys,
		buildCalendarMonth,
		getInitialCalendarMonthKeys,
		prependCalendarMonthKeys
	} from '$lib/repeat/calendar';
	import type { Completion, Habit } from '$lib/repeat/types';

	export let open = false;
	export let habits: Habit[] = [];
	export let completions: Completion[] = [];
	export let todayDate: string;
	export let selectedDate: string;
	export let onSelectDate: (dateKey: string) => void = () => {};

	let scroller: HTMLDivElement | null = null;
	let monthKeys: string[] = [];
	let visibleYear = '';
	let wasOpen = false;
	let paging = false;
	let topSpacerHeight = 0;
	let bottomSpacerHeight = 0;

	const PAGE_SIZE = 6;
	const RESERVED_MONTH_HEIGHT = 92;
	const RESERVED_PAGE_COUNT = 24;
	const EDGE_LOAD_DISTANCE = 560;

	$: months = monthKeys.map((monthKey) =>
		buildCalendarMonth(monthKey, habits, completions, todayDate, selectedDate)
	);

	$: if (open && !wasOpen) {
		wasOpen = true;
		void resetAndCenterToday();
	}

	$: if (!open && wasOpen) {
		wasOpen = false;
	}

	async function resetAndCenterToday() {
		monthKeys = getInitialCalendarMonthKeys(todayDate);
		topSpacerHeight = PAGE_SIZE * RESERVED_MONTH_HEIGHT * RESERVED_PAGE_COUNT;
		bottomSpacerHeight = PAGE_SIZE * RESERVED_MONTH_HEIGHT * RESERVED_PAGE_COUNT;
		visibleYear = todayDate.slice(0, 4);
		await tick();
		centerToday();
		updateVisibleYear();
	}

	function centerToday() {
		if (!scroller) {
			return;
		}

		const todayCell = scroller.querySelector<HTMLElement>('.day-cell.today');
		if (!todayCell) {
			return;
		}

		scroller.scrollTop =
			todayCell.offsetTop - scroller.clientHeight / 2 + todayCell.clientHeight / 2;
	}

	async function handleScroll() {
		updateVisibleYear();
		if (!scroller || paging) {
			return;
		}

		const firstMonth = scroller.querySelector<HTMLElement>('.calendar-month');
		const lastMonth = [...scroller.querySelectorAll<HTMLElement>('.calendar-month')].at(-1);
		const scrollerRect = scroller.getBoundingClientRect();
		const firstMonthDistance = firstMonth
			? firstMonth.getBoundingClientRect().top - scrollerRect.top
			: Number.POSITIVE_INFINITY;
		const lastMonthDistance = lastMonth
			? scrollerRect.bottom - lastMonth.getBoundingClientRect().bottom
			: Number.POSITIVE_INFINITY;

		if (firstMonthDistance > -EDGE_LOAD_DISTANCE) {
			paging = true;
			const previousFirstKey = monthKeys[0];
			const previousFirstOffset = firstMonth?.offsetTop ?? 0;
			monthKeys = prependCalendarMonthKeys(monthKeys, PAGE_SIZE);
			await tick();
			const previousFirst = previousFirstKey
				? scroller.querySelector<HTMLElement>(`[data-month="${previousFirstKey}"]`)
				: null;
			const insertedHeight = Math.max(
				0,
				(previousFirst?.offsetTop ?? previousFirstOffset) - previousFirstOffset
			);
			topSpacerHeight = Math.max(0, topSpacerHeight - insertedHeight);
			await tick();
			paging = false;
			return;
		}

		if (lastMonthDistance > -EDGE_LOAD_DISTANCE) {
			paging = true;
			const previousHeight = scroller.scrollHeight;
			monthKeys = appendCalendarMonthKeys(monthKeys, PAGE_SIZE);
			await tick();
			const insertedHeight = Math.max(0, scroller.scrollHeight - previousHeight);
			bottomSpacerHeight = Math.max(0, bottomSpacerHeight - insertedHeight);
			await tick();
			paging = false;
		}
	}

	function updateVisibleYear() {
		if (!scroller) {
			return;
		}

		const scrollerRect = scroller.getBoundingClientRect();
		const targetY = scrollerRect.top + 56;
		const monthElements = [...scroller.querySelectorAll<HTMLElement>('.calendar-month')];
		const activeMonth =
			monthElements.find((month) => month.getBoundingClientRect().bottom >= targetY) ??
			monthElements.at(-1);

		visibleYear = activeMonth?.dataset.year ?? todayDate.slice(0, 4);
	}
</script>

<Sidebar {open} label="Calendar" mobileFullScreen ariaHidden={!open} inert={!open}>
	<div class="calendar-drawer">
		<div class="calendar-heading">
			<h1>Calendar {visibleYear || todayDate.slice(0, 4)}</h1>
		</div>

		<div bind:this={scroller} class="calendar-scroll" on:scroll={handleScroll}>
			<div class="calendar-spacer" aria-hidden="true" style={`height: ${topSpacerHeight}px`}></div>
			{#each months as month (month.key)}
				<CalendarMonth {month} {onSelectDate} />
			{/each}
			<div
				class="calendar-spacer"
				aria-hidden="true"
				style={`height: ${bottomSpacerHeight}px`}
			></div>
		</div>
	</div>
</Sidebar>

<style>
	.calendar-drawer {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100%;
		min-height: 0;
		font-family: var(--font-family-mono);
	}

	.calendar-heading {
		position: relative;
		z-index: 1;
		padding-bottom: var(--space-4);
		background: var(--color-panel);
		transition: var(--theme-transition);
	}

	h1 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-normal);
		line-height: var(--line-height-tight);
	}

	.calendar-scroll {
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding-right: var(--space-1);
	}

	.calendar-spacer {
		flex: 0 0 auto;
	}
</style>
