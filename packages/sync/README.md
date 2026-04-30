# @ez/sync

`@ez/sync` contains reusable synchronization primitives for ez apps. It does not know about app schemas, storage, sessions, authentication, or UI state. Callers provide adapters for local storage, remote APIs, identity, timestamps, mapping, filtering, equality, and conflict handling.

The package exposes two primitives:

- `createSyncEngine`: runs one pull/reconcile/push/save sync pass for a collection.
- `createSyncController`: coordinates when sync passes should run from UI or app events.

## Exports

```ts
import {
	createSyncController,
	createSyncEngine,
	type ConflictHelpers,
	type RemoteMetadata,
	type SyncController,
	type SyncEngine,
	type SyncEngineConfig,
	type SyncMetadata,
	type SyncRequestOptions,
	type SyncResult
} from '@ez/sync';
```

## Sync Engine

The sync engine reconciles one local collection with one remote collection. It pulls a remote snapshot, compares each local item with its matching remote item, pushes local-only or locally changed records, pulls remote-only or remotely changed records, and calls an app-supplied conflict hook when both sides changed.

Create an engine with:

```ts
const engine = createSyncEngine<LocalItem, RemoteItem>(config);
const result = await engine.sync();
```

Each `SyncEngine` exposes:

```ts
interface SyncEngine<Local> {
	sync(): Promise<SyncResult<Local>>;
	isSyncInProgress(): boolean;
}
```

`sync()` throws `Error('Sync already in progress.')` if called again while the same engine instance is already syncing.

### Local and Remote Metadata

These metadata interfaces are provided as shared conventions. Your concrete item types can extend them.

```ts
interface SyncMetadata {
	id: string;
	updatedAt: string;
	deletedAt: string | null;
	lastSyncedAt: string | null;
	lastKnownRemoteUpdatedAt?: string | null;
	lastKnownRemoteDeletedAt?: string | null;
}

interface RemoteMetadata {
	id: string;
	updated_at: string;
	deleted_at: string | null;
}
```

The engine treats all timestamps as comparable strings. Use a stable sortable format such as ISO 8601.

### Config

```ts
interface SyncEngineConfig<Local, Remote> {
	pull(since: string | null): Promise<Remote[]>;
	push(item: Remote): Promise<Remote>;

	getLocal(): Promise<Local[]>;
	saveLocal(items: Local[]): Promise<void>;

	toRemote(local: Local): Remote;
	toLocal(remote: Remote, existing?: Local | null): Local;

	getId(item: Local | Remote): string;
	getSince(localItems: Local[]): string | null;

	getLocalUpdatedAt(local: Local): string;
	getRemoteUpdatedAt(remote: Remote): string;
	getLocalDeletedAt(local: Local): string | null;
	getRemoteDeletedAt(remote: Remote): string | null;
	getLastSyncedAt(local: Local): string | null;
	setLastSyncedAt(local: Local, value: string): Local;

	shouldSync?(local: Local): boolean;
	shouldKeepRemote?(remote: Remote): boolean;
	areStatesEqual?(local: Local, remote: Remote): boolean;
	onConflict?(local: Local, remote: Remote, helpers: ConflictHelpers<Local>): Promise<Local[]>;
}
```

Required callbacks:

- `pull(since)`: returns remote records changed since the caller-selected cursor. The engine passes the value returned by `getSince(localItems)`.
- `push(item)`: writes one mapped remote item and returns the authoritative remote row from the server.
- `getLocal()`: returns the local records that may participate in this sync pass.
- `saveLocal(items)`: persists the full reconciled local collection returned by the engine.
- `toRemote(local)`: maps a local item into the remote API shape.
- `toLocal(remote, existing)`: maps a remote row into a local item, merging with `existing` where local-only fields should be preserved.
- `getId(item)`: returns the stable id used to match local and remote records.
- `getSince(localItems)`: returns the incremental pull cursor, or `null` for a full pull.
- Timestamp getters: expose local and remote update/delete timestamps plus `lastSyncedAt`.
- `setLastSyncedAt(local, value)`: returns a copy of the local item with `lastSyncedAt` set to the server timestamp supplied by the engine.

Optional callbacks:

- `shouldSync(local)`: return `false` for local items that should be preserved but excluded from sync, such as ephemeral drafts.
- `shouldKeepRemote(remote)`: return `false` for remote rows that should not exist locally, such as soft-deleted rows.
- `areStatesEqual(local, remote)`: return `true` when the domain fields already match even if timestamps suggest both sides changed.
- `onConflict(local, remote, helpers)`: resolves a conflict where both sides changed since the last sync. Return the local item or items that should remain after resolution.

### Conflict Helpers

`onConflict` receives:

```ts
interface ConflictHelpers<Local> {
	push(local: Local): Promise<Local>;
}
```

Use `helpers.push(local)` to push a conflict resolution record, such as a forked copy. The helper maps through `toRemote`, calls `push`, converts the authoritative response through `toLocal`, updates `lastSyncedAt`, and includes the push in result counts.

### Result

```ts
interface SyncResult<Local> {
	items: Local[];
	pushed: number;
	pulled: number;
	conflicts: number;
	pushedIds: string[];
	pulledIds: string[];
	conflictIds: string[];
}
```

`items` is the reconciled local collection passed to `saveLocal`.

### Reconciliation Rules

For each local item:

| Condition                                   | Outcome                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| `shouldSync(local) === false`               | Preserve local item without syncing it.                                        |
| No matching remote and local is deleted     | Drop the local tombstone.                                                      |
| No matching remote and local is not deleted | Push local item.                                                               |
| Neither side changed since `lastSyncedAt`   | Keep the authoritative remote version locally if `shouldKeepRemote` allows it. |
| `areStatesEqual(local, remote) === true`    | Mark local item synced to the remote timestamp.                                |
| Local changed only                          | Push local item.                                                               |
| Remote changed only                         | Pull remote item, or remove local item if `shouldKeepRemote` rejects it.       |
| Both changed                                | Call `onConflict`, or prefer the remote item if no conflict hook is supplied.  |

After local records are processed, remote-only records are added locally when `shouldKeepRemote` allows them.

Push responses are authoritative. Every push response is immediately converted with `toLocal`, marked synced with the returned remote `updated_at` value from `getRemoteUpdatedAt`, and included in the next local collection. The engine never waits for a later pull to confirm a write.

### Engine Example

```ts
type LocalPage = SyncMetadata & {
	userId: string;
	title: string;
	content: string;
	isEphemeral?: boolean;
};

type RemotePage = RemoteMetadata & {
	user_id: string;
	title: string;
	content: string;
};

const pageSync = createSyncEngine<LocalPage, RemotePage>({
	pull: (since) => api.listPages({ since }),
	push: (page) => api.upsertPage(page),

	getLocal: () => db.getPages(),
	saveLocal: (pages) => db.savePages(pages),

	toRemote: (page) => ({
		id: page.id,
		user_id: page.userId,
		title: page.title,
		content: page.content,
		updated_at: page.updatedAt,
		deleted_at: page.deletedAt
	}),
	toLocal: (remote, existing) => ({
		...existing,
		id: remote.id,
		userId: remote.user_id,
		title: remote.title,
		content: remote.content,
		updatedAt: remote.updated_at,
		deletedAt: remote.deleted_at,
		lastSyncedAt: remote.updated_at,
		lastKnownRemoteUpdatedAt: remote.updated_at,
		lastKnownRemoteDeletedAt: remote.deleted_at
	}),

	getId: (item) => item.id,
	getSince: (pages) =>
		pages.reduce<string | null>((since, page) => {
			if (!page.lastSyncedAt) return since;
			return since === null || page.lastSyncedAt < since ? page.lastSyncedAt : since;
		}, null),

	getLocalUpdatedAt: (page) => page.updatedAt,
	getRemoteUpdatedAt: (page) => page.updated_at,
	getLocalDeletedAt: (page) => page.deletedAt,
	getRemoteDeletedAt: (page) => page.deleted_at,
	getLastSyncedAt: (page) => page.lastSyncedAt,
	setLastSyncedAt: (page, value) => ({ ...page, lastSyncedAt: value }),

	shouldSync: (page) => page.isEphemeral !== true,
	shouldKeepRemote: (remote) => remote.deleted_at === null,
	areStatesEqual: (local, remote) =>
		local.title === remote.title &&
		local.content === remote.content &&
		local.deletedAt === remote.deleted_at,
	onConflict: async (local, remote, helpers) => [
		{
			...local,
			title: remote.title,
			content: remote.content,
			updatedAt: remote.updated_at,
			deletedAt: remote.deleted_at,
			lastSyncedAt: remote.updated_at
		},
		await helpers.push({
			...local,
			id: crypto.randomUUID(),
			title: `${local.title} (conflict copy)`,
			deletedAt: null
		})
	]
});

const result = await pageSync.sync();
```

## Sync Controller

The sync controller schedules and coalesces sync requests. It is useful for UI flows where edits should trigger debounced background sync, explicit user actions should sync immediately, and requests made while a sync is running should produce at most one follow-up run.

Create a controller with:

```ts
const controller = createSyncController({
	delayMs: 3000,
	runSync: async ({ showSuccessNotice }) => {
		const result = await engine.sync();
		if (showSuccessNotice) {
			showSyncedNotice(result);
		}
	}
});
```

The options object is structurally typed:

```ts
{
	delayMs: number;
	runSync(options: SyncRequestOptions): Promise<void>;
	timer?: {
		setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
		clearTimeout(handle: ReturnType<typeof setTimeout>): void;
	};
}
```

`timer` is optional and defaults to `globalThis`. Tests can provide a fake timer.

### Request Options

```ts
interface SyncRequestOptions {
	showSuccessNotice: boolean;
}
```

The default is `{ showSuccessNotice: false }`.

### Controller Methods

```ts
interface SyncController {
	scheduleDebounced(): void;
	requestImmediate(options?: Partial<SyncRequestOptions>): void;
	queueFollowUp(options?: Partial<SyncRequestOptions>): void;
	cancel(): void;
}
```

- `scheduleDebounced()`: clears any pending debounced run and schedules a new one after `delayMs`.
- `requestImmediate(options)`: clears any pending debounced run and starts a sync immediately.
- `queueFollowUp(options)`: requests a sync without clearing a pending debounce. If a sync is already running, the controller coalesces all busy-time requests into one follow-up run.
- `cancel()`: clears a pending debounced run. It does not cancel an in-progress `runSync` promise.

If `requestImmediate` or `queueFollowUp` is called while `runSync` is busy, the controller records one pending follow-up. If any pending request asks for `showSuccessNotice: true`, the follow-up receives `showSuccessNotice: true`.

### Controller Example

```ts
const syncController = createSyncController({
	delayMs: 3000,
	runSync: async (options) => {
		await syncUserPages(options);
	}
});

function onDocumentChanged() {
	syncController.scheduleDebounced();
}

function onUserClickedSyncNow() {
	syncController.requestImmediate({ showSuccessNotice: true });
}

function onRemoteChangeNotification() {
	syncController.queueFollowUp();
}

function onUnmount() {
	syncController.cancel();
}
```

## Testing

Run the package tests with:

```sh
pnpm --filter @ez/sync test
```
