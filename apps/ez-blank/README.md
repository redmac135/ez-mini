# ez-blank

SvelteKit app for a minimal local-first writing surface with sync through `@ez/apps-api`.

## Development

From the repo root:

```sh
pnpm --filter @ez/apps-blank dev
```

Or run all apps:

```sh
pnpm dev
```

The app requires a public API URL at build and dev-server startup. Use the tracked mode-specific env files or create `.env` from `.env.example`:

```sh
PUBLIC_EZ_API_URL=http://localhost:8787/v1
```

The Vite config fails fast when `PUBLIC_EZ_API_URL` is missing, so production builds cannot silently ship without sync/auth.

## Scripts

- `pnpm --filter @ez/apps-blank dev` - start Vite.
- `pnpm --filter @ez/apps-blank build` - build the app.
- `pnpm --filter @ez/apps-blank check` - run Svelte checks.
- `pnpm --filter @ez/apps-blank test` - run parser and editor tests.

Shared styles come from `@ez/design/tokens.css`; app-specific layout measurements stay inside app/component CSS.

The frontend is intentionally static (`@sveltejs/adapter-static`) and talks to the API with simple credentialed fetch calls.
