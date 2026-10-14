export type JourneyEntry = {
	id: string;
	text: string;
	createdAt: string;
};

export type StoredJourneyEntry = JourneyEntry & {
	userId: string;
	updatedAt: string;
	deletedAt: string | null;
	lastSyncedAt: string | null;
};

export const ANONYMOUS_USER_ID = 'anonymous';

export type ElementBounds = {
	top: number;
	left: number;
	width: number;
	height: number;
};

export function readBounds(element: Element): ElementBounds {
	const { top, left, width, height } = element.getBoundingClientRect();
	return { top, left, width, height };
}

export function setFixedBounds(element: HTMLElement, bounds: ElementBounds) {
	element.style.position = 'fixed';
	element.style.inset = 'auto';
	element.style.top = `${bounds.top}px`;
	element.style.left = `${bounds.left}px`;
	element.style.width = `${bounds.width}px`;
	element.style.height = `${bounds.height}px`;
}

export function clearFixedBounds(element: HTMLElement) {
	element.style.removeProperty('position');
	element.style.removeProperty('inset');
	element.style.removeProperty('top');
	element.style.removeProperty('left');
	element.style.removeProperty('width');
	element.style.removeProperty('height');
}

export function animateBounds(
	element: HTMLElement,
	from: ElementBounds,
	to: ElementBounds
): Animation | undefined {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

	return element.animate(
		[
			{
				top: `${from.top}px`,
				left: `${from.left}px`,
				width: `${from.width}px`,
				height: `${from.height}px`
			},
			{
				top: `${to.top}px`,
				left: `${to.left}px`,
				width: `${to.width}px`,
				height: `${to.height}px`
			}
		],
		{ duration: 360, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
	);
}
