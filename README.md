# ez-mini

Minimal app monorepo for small, focused tools.

## Workspaces

- `apps/ez-blank` - SvelteKit writing app.
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

## Design Tokens

The design package stays intentionally small and transferable. Tokens describe broad primitives, not component measurements:

- spacing: `--space-0` through `--space-8`
- radius: `--radius-0`, `--radius-1`, `--radius-2`, `--radius-round`
- color: app-neutral primitives like `--color-bg`, `--color-fg`, `--color-panel`, and `--color-border`

Component-specific sizes, offsets, shadows, and widths belong in the component CSS that uses them.
