import type { ChangedPageEvent, LocalPageEventType } from './session-events';

export const PAGES_CHANNEL_NAME = 'pages';

export interface PageBroadcastMessage {
	type: LocalPageEventType;
	id: string;
	userId: string;
}

export function createPageBroadcastMessage(
	event: ChangedPageEvent,
	userId: string
): PageBroadcastMessage {
	return {
		type: event.type,
		id: event.id,
		userId
	};
}

export function readPageBroadcastMessage(
	value: unknown,
	allowedTypes: Set<LocalPageEventType>,
	currentUserId: string
): PageBroadcastMessage | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const message = value as Record<string, unknown>;
	if (
		typeof message.type !== 'string' ||
		typeof message.id !== 'string' ||
		typeof message.userId !== 'string'
	) {
		return null;
	}

	if (!allowedTypes.has(message.type as LocalPageEventType) || message.userId !== currentUserId) {
		return null;
	}

	return {
		type: message.type as LocalPageEventType,
		id: message.id,
		userId: message.userId
	};
}
