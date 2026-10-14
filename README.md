# ez-mini

Minimal app monorepo for small, focused tools.

## Principles

- Local-first app behavior: notes are saved locally before remote sync.
- Small platform pieces: static SvelteKit frontend, plain Cloudflare Worker API, Supabase REST/Auth.
- Shared packages stay tiny and intentional. `@ez/sync` is shared because upcoming todo and habit apps use the same sync model.
- External versions are centralized in the pnpm catalog in `pnpm-workspace.yaml`; app packages use `workspace:*` for local packages.

## Workspaces

- `apps/ez-blank` - SvelteKit writing app.
- `apps/ez-repeat` - SvelteKit habit tracker.
- `apps/api` - Cloudflare Worker API for auth/session/page sync.
- `packages/design` - shared CSS tokens only.
- `packages/ui` - small Svelte primitives.
- `packages/auth` - client helpers for API auth.

## Commands

Install dependencies:

```sh
pnpm install
```

Run every app with a `dev` script:

```sh
pnpm dev
```

Run one app:

```sh
pnpm --filter @ez/apps-blank dev
pnpm --filter @ez/apps-api dev
```

Check and test:

```sh
pnpm check
pnpm test
pnpm lint
```

Run the component library and app UI stories:

```sh
pnpm storybook
pnpm build-storybook
```

Storybook groups the system by layer: `Foundations` shows the shared design tokens, `Components` covers `@ez/ui`, and `Apps` documents app-owned components from `ez-blank` and `ez-repeat`.

## Design Tokens

The design package stays intentionally small and transferable. Tokens describe broad primitives, not component measurements:

- spacing: `--space-0` through `--space-8`
- radius: `--radius-0`, `--radius-1`, `--radius-2`, `--radius-round`
- color: app-neutral primitives like `--color-bg`, `--color-fg`, `--color-panel`, and `--color-border`

Component-specific sizes, offsets, shadows, and widths belong in the component CSS that uses them.

The current structure is a standard, minimal setup for these apps: `@ez/design` owns global tokens, `@ez/ui` owns reusable Svelte components, and each app keeps its domain-specific components alongside its feature code. `ez-repeat`'s calendar and habit components and `ez-blank`'s editor are app-specific, so they should stay in their apps. The toast stack was duplicated byte-for-byte across both app routes, so it now lives in `@ez/ui` and has one shared story. The remaining app components are distinct feature compositions; extracting them would add coupling without removing repeated UI.
