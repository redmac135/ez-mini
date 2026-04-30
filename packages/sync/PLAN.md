# Sync Engine — API Specification & Usage

This document defines the **public API and contract** for a reusable sync engine, and how it integrates with apps like `ez-blank`.

It intentionally avoids implementation details. This is strictly about:

- what the engine expects
- what it guarantees
- how it is used

---

# 1. Purpose

The sync engine is responsible for:

> Determining how local and remote data are reconciled, and executing push/pull operations safely under eventual consistency.

It does **not**:

- manage UI state
- define data schemas
- own your database
- know about sessions or app-specific logic

---

# 2. Core Concepts

## 2.1 Local Entity Requirements

Each local entity must include:

```ts
type SyncMetadata = {
	id: string;

	updatedAt: string;
	deletedAt: string | null;

	lastSyncedAt: string | null;

	// optional but recommended
	lastKnownRemoteUpdatedAt?: string | null;
	lastKnownRemoteDeletedAt?: string | null;
};
```

All other fields are opaque to the engine.

---

## 2.2 Remote Entity Requirements

Remote entities must include:

```ts
type RemoteMetadata = {
	id: string;

	updated_at: string;
	deleted_at: string | null;
};
```

---

## 2.3 Source of Truth Rule

> Any response returned from a `push` operation is authoritative and must immediately update local state.

The engine guarantees:

- No reliance on future pulls to confirm writes
- Local state is always reconciled with server responses

---

# 3. Engine API

## 3.1 Factory

```ts
createSyncEngine<Local, Remote>(config): SyncEngine<Local, Remote>
```

---

## 3.2 Config Interface

```ts
type SyncEngineConfig<Local, Remote> = {
	// -------------------------
	// Remote operations
	// -------------------------

	pull: (since: string | null) => Promise<Remote[]>;

	/**
	 * Pushes local changes to the server.
	 * MUST return the authoritative updated rows from the server.
	 */
	push: (items: Remote[]) => Promise<Remote[]>;

	// -------------------------
	// Local storage
	// -------------------------

	getLocal: () => Promise<Local[]>;

	saveLocal: (items: Local[]) => Promise<void>;

	// -------------------------
	// Mapping
	// -------------------------

	toRemote: (local: Local) => Remote;

	/**
	 * Converts remote → local.
	 * Must merge into existing local where appropriate.
	 */
	toLocal: (remote: Remote, existing?: Local) => Local;

	// -------------------------
	// Identity
	// -------------------------

	getId: (item: Local | Remote) => string;

	// -------------------------
	// Timestamps
	// -------------------------

	getLocalUpdatedAt: (local: Local) => string;
	getRemoteUpdatedAt: (remote: Remote) => string;

	getLocalDeletedAt: (local: Local) => string | null;
	getRemoteDeletedAt: (remote: Remote) => string | null;

	getLastSyncedAt: (local: Local) => string | null;

	/**
	 * Must set lastSyncedAt based on REMOTE values (not client time)
	 */
	setLastSyncedAt: (local: Local, value: string) => Local;

	// -------------------------
	// Hooks (behavior control)
	// -------------------------

	/**
	 * Determines if a local entity should participate in sync.
	 * Example: skip ephemeral items
	 */
	shouldSync?: (local: Local) => boolean;

	/**
	 * Determines if a remote entity should exist locally.
	 * Example: filter out deleted rows
	 */
	shouldKeepRemote?: (remote: Remote) => boolean;

	/**
	 * Defines equality between local and remote states.
	 * REQUIRED for correctness in most apps.
	 */
	areStatesEqual?: (local: Local, remote: Remote) => boolean;

	/**
	 * Handles conflicts where both local and remote changed.
	 * Must return the local entities that should exist after resolution.
	 */
	onConflict?: (local: Local, remote: Remote) => Promise<Local[]>;
};
```

---

## 3.3 Engine Methods

```ts
type SyncEngine<Local, Remote> = {
	/**
	 * Executes one full sync pass.
	 */
	sync(): Promise<SyncResult>;
};
```

---

## 3.4 Result

```ts
type SyncResult = {
	pushed: number;
	pulled: number;
	conflicts: number;
};
```

---

# 4. Engine Guarantees

## 4.1 Deterministic Sync Behavior

For each entity:

| Condition           | Outcome             |
| ------------------- | ------------------- |
| No changes          | No-op               |
| Same state          | Mark synced         |
| Local changed only  | Push                |
| Remote changed only | Pull                |
| Both changed        | Conflict resolution |

---

## 4.2 Push Response Handling

After every push:

- Returned remote rows are immediately converted via `toLocal`
- Local state is updated using `saveLocal`
- `lastSyncedAt` is set using server timestamps

---

## 4.3 No Assumptions About Time

The engine:

- does not trust client timestamps
- does not assume ordering guarantees
- relies on server responses for final state

---

## 4.4 No Product Logic

The engine does not:

- manage UI fields (selection, focus, etc.)
- understand sessions
- manage active items
- generate user-facing labels

---

# 5. Usage in `ez-blank`

## 5.1 Create Page Sync

```ts
const pageSync = createSyncEngine<PageRecord, RemotePageRow>({
	pull: (since) => api.listPages({ since }),

	push: async (items) => {
		return Promise.all(items.map(api.upsertPage));
	},

	getLocal: () => db.getPages(),

	saveLocal: (pages) => db.savePages(pages),

	toRemote: (local) => ({
		id: local.id,
		user_id: local.userId,
		title: local.title,
		content: local.content,
		created_at: local.createdAt,
		updated_at: local.updatedAt,
		deleted_at: local.deletedAt
	}),

	toLocal: (remote, existing) => ({
		...existing,
		id: remote.id,
		userId: remote.user_id,
		title: remote.title,
		content: remote.content,
		createdAt: remote.created_at,
		updatedAt: remote.updated_at,
		deletedAt: remote.deleted_at,

		// preserve UI state
		selectionStart: existing?.selectionStart ?? 0,
		selectionEnd: existing?.selectionEnd ?? 0,

		lastSyncedAt: remote.updated_at,
		lastKnownRemoteUpdatedAt: remote.updated_at,
		lastKnownRemoteDeletedAt: remote.deleted_at
	}),

	getId: (x) => x.id,

	getLocalUpdatedAt: (l) => l.updatedAt,
	getRemoteUpdatedAt: (r) => r.updated_at,

	getLocalDeletedAt: (l) => l.deletedAt,
	getRemoteDeletedAt: (r) => r.deleted_at,

	getLastSyncedAt: (l) => l.lastSyncedAt,

	setLastSyncedAt: (l, v) => ({
		...l,
		lastSyncedAt: v
	}),

	shouldSync: (page) => !page.isEphemeral,

	shouldKeepRemote: (remote) => remote.deleted_at === null,

	areStatesEqual: (local, remote) =>
		local.title === remote.title &&
		local.content === remote.content &&
		(local.deletedAt ?? null) === (remote.deleted_at ?? null),

	onConflict: async (local, remote) => {
		const fork = forkConflictPage(local);
		const pushed = await api.upsertPage(/* mapped fork */);

		return [
			// remote version (converted later)
			// fork version
		];
	}
});
```

---

## 5.2 Running Sync

```ts
const result = await pageSync.sync();
```

---

## 5.3 Post-Sync App Logic

After sync completes:

- Fetch updated local data
- Rebuild session state
- Handle active page logic

```ts
const pages = await db.getPages();

const session = ensureValidActivePage({
	pages,
	activePageId: currentActivePageId
});
```

---

# 6. Usage in `ez-action`

`ez-action` creates its own adapter:

```ts
const todoSync = createSyncEngine<Todo, RemoteTodo>({
	// same API, different mappings and equality logic
});
```

No sync logic is duplicated.

---

# 7. Non-Goals

The sync engine does NOT:

- define schemas
- manage persistence layer
- handle UI concerns
- manage app-level relationships
- replace your backend

---

# 8. Summary

The sync engine:

- standardizes sync behavior across apps
- delegates all model-specific logic via config
- treats server responses as authoritative
- remains fully decoupled from product logic

This allows:

- reuse across `ez-blank` and `ez-action`
- consistent sync guarantees
- minimal duplication
