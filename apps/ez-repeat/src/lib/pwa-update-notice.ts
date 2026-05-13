export const APP_UPDATED_NOTICE = 'App updated';
export const APP_UPDATED_NOTICE_EVENT = 'ez-repeat-app-updated';
const APP_UPDATED_NOTICE_KEY = 'ez-repeat-app-updated-notice';

export function queueAppUpdatedNotice(storage: Pick<Storage, 'setItem'> = localStorage) {
	storage.setItem(APP_UPDATED_NOTICE_KEY, APP_UPDATED_NOTICE);
}

export function consumeQueuedAppUpdatedNotice(
	storage: Pick<Storage, 'getItem' | 'removeItem'> = localStorage
) {
	const message = storage.getItem(APP_UPDATED_NOTICE_KEY);
	if (message) {
		storage.removeItem(APP_UPDATED_NOTICE_KEY);
	}
	return message;
}
