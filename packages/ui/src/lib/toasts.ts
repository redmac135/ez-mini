import { writable } from 'svelte/store';

export interface ToastNotice {
	id: number;
	message: string;
}

export function createToastController(options: { timeoutMs?: number } = {}) {
	const timeoutMs = options.timeoutMs ?? 4000;
	const notices = writable<ToastNotice[]>([]);
	const timeouts = new Map<number, number>();
	let nextId = 1;

	function dismiss(id: number) {
		const timeout = timeouts.get(id);
		if (timeout) {
			window.clearTimeout(timeout);
			timeouts.delete(id);
		}
		notices.update((current) => current.filter((notice) => notice.id !== id));
	}

	function show(message: string) {
		if (typeof window === 'undefined') return;
		const id = nextId++;
		notices.update((current) => [{ id, message }, ...current]);
		timeouts.set(
			id,
			window.setTimeout(() => dismiss(id), timeoutMs)
		);
	}

	function clear() {
		for (const timeout of timeouts.values()) {
			window.clearTimeout(timeout);
		}
		timeouts.clear();
		notices.set([]);
	}

	return {
		subscribe: notices.subscribe,
		show,
		dismiss,
		clear
	};
}
