# ez-mini API

Cloudflare Worker API for ez-mini auth sessions and page sync.

Routes are served under `/v1`.

## Development

Run from the repo root:

```sh
pnpm --filter @ez/apps-api dev
```

The dev script starts Wrangler with the `development` environment from `wrangler.toml`,
which sets localhost CORS for the blank app.

The blank app expects this local URL:

```sh
PUBLIC_EZ_API_URL=http://localhost:8787/v1
```

Production-style values are documented in `.env.example`.

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
