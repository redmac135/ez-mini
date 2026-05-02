# ez-blank

SvelteKit app for a minimal local-first writing surface with optional sync through `@ez/apps-api`.

## Development

From the repo root:

```sh
pnpm --filter @ez/apps-blank dev
```

Or run all apps:

```sh
pnpm dev
```

To enable API-backed auth and sync, create `.env` from `.env.example`:

```sh
PUBLIC_EZ_API_URL=http://localhost:8787/v1
```

Without `PUBLIC_EZ_API_URL`, the app runs without the remote API client.

## Scripts

- `pnpm --filter @ez/apps-blank dev` - start Vite.
- `pnpm --filter @ez/apps-blank build` - build the app.
- `pnpm --filter @ez/apps-blank check` - run Svelte checks.
- `pnpm --filter @ez/apps-blank test` - run parser and editor tests.

Shared styles come from `@ez/design/tokens.css`; app-specific layout measurements stay inside app/component CSS.
