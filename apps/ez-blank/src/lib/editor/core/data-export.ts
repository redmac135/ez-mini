import type { PageRecord } from '../persistence/records';

type ExportPage = Pick<PageRecord, 'id' | 'title' | 'content' | 'createdAt' | 'updatedAt'>;
type RemotePage = {
	id: string;
	user_id: string;
	title: string;
	content: string;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	revision: number;
};

/** Export explicit page fields only, preserving local drafts and remote conflict versions. */
export function exportPages(
	pages: readonly PageRecord[],
	userId: string,
	remote?: readonly RemotePage[]
) {
	const result: ExportPage[] = [];
	const remoteById = new Map<string, RemotePage>();
	for (const page of remote ?? []) {
		if (page.user_id !== userId) throw new Error('Invalid account data returned by server.');
		remoteById.set(page.id, page);
	}
	for (const page of pages.filter((entry) => entry.userId === userId)) {
		const saved = remoteById.get(page.id);
		remoteById.delete(page.id);
		if (saved && saved.revision !== page.serverRevision && page.syncStatus === 'synced') {
			if (saved.deleted_at === null) result.push(remotePage(saved));
			continue;
		}
		if (
			saved &&
			saved.revision !== page.serverRevision &&
			page.syncStatus !== 'synced' &&
			saved.deleted_at === null
		) {
			result.push(remotePage(saved));
		}
		if (page.deletedAt === null) result.push(localPage(page));
	}
	for (const page of remoteById.values()) {
		if (page.deleted_at === null) result.push(remotePage(page));
	}
	return { pages: result };
}

function localPage({ id, title, content, createdAt, updatedAt }: PageRecord): ExportPage {
	return { id, title, content, createdAt, updatedAt };
}

function remotePage(page: RemotePage): ExportPage {
	return {
		id: page.id,
		title: page.title,
		content: page.content,
		createdAt: page.created_at,
		updatedAt: page.updated_at
	};
}
