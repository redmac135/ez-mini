export function beginAuthRequestId(currentRequestId: number) {
	return currentRequestId + 1;
}

export function isLatestAuthRequest(currentRequestId: number, requestId: number) {
	return currentRequestId === requestId;
}
