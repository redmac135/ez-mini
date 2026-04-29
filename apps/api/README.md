# ez-mini API

Cloudflare Worker API for ez-mini auth sessions and page sync.

Routes are served under `/mini/v1`.

## Development

Create local Worker variables:

```sh
cp .dev.vars.example .dev.vars
```

Then run from the repo root:

```sh
pnpm --filter @ez/apps-api dev
```

The blank app expects this local URL:

```sh
PUBLIC_EZ_API_URL=http://localhost:8787/mini/v1
```

Production-style values are documented in `.env.example`. Wrangler local development uses
`.dev.vars.example` because `.dev.vars` is the file Wrangler loads.

## Required Variables

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `CORS_ORIGINS`
- `COOKIE_DOMAIN` for production shared-domain cookies

The Worker also needs a `SESSIONS` KV namespace, configured in `wrangler.toml`.

## Scripts

- `pnpm --filter @ez/apps-api dev` - start Wrangler locally.
- `pnpm --filter @ez/apps-api check` - run TypeScript checks.
- `pnpm --filter @ez/apps-api test` - run API tests.
- `pnpm --filter @ez/apps-api deploy` - deploy with Wrangler.
