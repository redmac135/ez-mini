import { ApiError } from './errors.ts';

export function json(body: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(body), init);
}

export async function readJson<T>(request: Request): Promise<T> {
	return (await request.json().catch(() => {
		throw new ApiError(400, 'Invalid JSON body.');
	})) as T;
}

export function firstRow<T>(rows: T[]) {
	const row = rows[0];
	if (!row) {
		throw new ApiError(404, 'Row not found.');
	}

	return row;
}
