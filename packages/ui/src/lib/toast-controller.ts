export interface ToastNotice {
	id: number;
	message: string;
}

export function createToastController(onChange: (notices: ToastNotice[]) => void) {
	let notices: ToastNotice[] = [];
	let nextId = 1;
	const timeouts = new Map<number, number>();

	function dismiss(id: number) {
		const timeout = timeouts.get(id);
		if (timeout !== undefined) window.clearTimeout(timeout);
		timeouts.delete(id);
		notices = notices.filter((notice) => notice.id !== id);
		onChange(notices);
	}

	return {
		show(message: string) {
			if (typeof window === 'undefined') return;
			const id = nextId++;
			notices = [{ id, message }, ...notices];
			onChange(notices);
			timeouts.set(
				id,
				window.setTimeout(() => dismiss(id), 4000)
			);
		},
		dismiss,
		clear() {
			for (const timeout of timeouts.values()) window.clearTimeout(timeout);
			timeouts.clear();
			notices = [];
			onChange(notices);
		}
	};
}
