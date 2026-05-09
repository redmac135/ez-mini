# Copilot instructions for `ez-mini`

## Build, test, lint, and check

Run from the repository root unless noted.

```sh
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm check
pnpm lint
pnpm format
```

Targeted development commands:

```sh
pnpm dev:api
pnpm --filter @ez/apps-blank dev
pnpm --filter @ez/apps-api dev
pnpm --filter @ez/apps-api deploy
```

Single-test commands (Node test runner workspaces):

```sh
pnpm --filter @ez/auth exec node --test tests/auth.test.ts
pnpm --filter @ez/sync exec node --test tests/sync-engine.test.ts
pnpm --filter @ez/apps-api exec node --test tests/api.test.ts
node --test scripts/design-tokens.test.mjs
```

## High-level architecture

This is a pnpm + Turborepo monorepo with two deployable apps and small shared packages.

- `apps/ez-blank`: static SvelteKit writing app (`prerender = true`, adapter-static).
- `apps/api`: Cloudflare Worker API under `/v1` for auth/session/page/settings operations.
- `packages/auth`: browser auth client helpers around API endpoints.
- `packages/sync`: generic sync engine/controller primitives reused by app-level sync logic.
- `packages/design`: cross-app CSS tokens only.
- `packages/ui`: shared Svelte UI primitives.
- `apps/ez-repeat`: planned next app (habit tracker) with product/data design captured in `apps/ez-repeat/PLAN.md`.

Request/data flow for signed-in editing:

1. `apps/ez-blank/src/routes/+page.svelte` orchestrates auth, editor state, local persistence, tab sync, and remote sync triggers.
2. Local session state is persisted in `EditorStorage` (`IndexedDB` with memory fallback) and keyed by user (`anonymous` or authenticated user ID).
3. Page sync is driven by `syncUserPages` in `src/lib/editor/sync.ts`, which wraps `@ez/sync` and maps editor page records to API payloads.
4. API calls go through `src/lib/api.ts`, which configures `@ez/auth` and uses credentialed fetch to Worker routes.
5. Worker route dispatch is in `apps/api/src/index.ts`, with auth/session in `src/auth`, page upsert/list in `src/pages/routes.ts`, and active-page settings in `src/settings/routes.ts`.
6. Worker auth and data access proxy to Supabase (`supabaseAuth`, `supabaseRest`) and persist device-scoped sessions in KV.

`apps/ez-repeat/PLAN.md` (next app context) currently defines:

- Core entities: `habits` and `completions`, with explicit soft lifecycle fields (`archived_at`, `deleted_at`).
- Recurrence model (`daily`, `weekly`, `daysOfWeek`) with optional sliding windows.
- Client-side completion window math and progress semantics.
- Phrase-to-structured-habit parsing (title, target_count, recurrence) with defaults and token extraction rules.
- Interaction model centered on lightweight creation and swipe-driven completion/archive/delete actions.

## Key repository conventions

- Product philosophy: build very minimal apps that just work. Prefer minimalism over feature breadth, keep only high-value features, remove clutter aggressively, and keep UI design intentionally minimal.
- `PUBLIC_EZ_API_URL` is required at startup/build for `apps/ez-blank` (`vite.config.ts` throws if missing).
- API routes are expected under `/v1`; Worker strips this prefix before routing.
- Auth/session model is cookie-based and device-scoped:
  - `ez_mini_device_id` and `ez_mini_active_session_id` cookies.
  - KV keys use `device:<deviceId>:session:<sessionId>`.
- Page deletion is soft-delete (`deletedAt` / `deleted_at`); `/pages` intentionally exposes list + upsert only (no hard-delete endpoint).
- Editor pages start as ephemeral placeholders (`isEphemeral: true`) and are excluded from remote sync until materialized.
- Sync timestamp comparisons are lexicographic string comparisons; use stable ISO timestamps.
- `@ez/sync` treats push responses as authoritative and writes them back immediately; do not require a follow-up pull to confirm writes.
- Keep design tokens app-neutral in `packages/design`; component-specific sizing/styling variables belong in component CSS (for example, editor-specific variables in `Editor.svelte`).
- Tests use Node’s built-in runner (`node --test`) and workspace scripts; avoid introducing alternate test frameworks unless explicitly requested.
