# ez-mini API

Cloudflare Worker API for ez-mini auth sessions, settings, and app data sync.

Routes are served under `/v1`.

## Development

Run from the repo root:

```sh
pnpm --filter @ez/apps-api dev
```

The dev script starts Wrangler with the `development` environment from `wrangler.toml`,
which sets localhost CORS for the blank app.

The apps expect this local URL:

```sh
PUBLIC_EZ_API_URL=http://localhost:1350/v1
```

Production-style values are documented in `.env.example`.

## Required Variables

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `CORS_ORIGINS`
- `COOKIE_DOMAIN` for production shared-domain cookies

The Worker also needs a `SESSIONS` KV namespace, configured in `wrangler.toml`.

## API Shape

- `POST /v1/auth/login`
- `POST /v1/auth/verify`
- `GET /v1/auth/session`
- `POST /v1/auth/switch`
- `POST /v1/auth/anonymous`
- `POST /v1/auth/logout`
- `GET /v1/pages`
- `POST /v1/pages`
- `GET /v1/journey/entries`
- `POST /v1/journey/entries`
- `GET /v1/settings`
- `PATCH /v1/settings`

The pages API only exposes collection list/upsert routes because `ez-blank` is the sole client and already represents deletes as soft-deleted upserted page rows.

Journey stores entries in the `journey.entries` table. Apply `supabase/migrations/20261014000000_journey_entries.sql` to the Supabase project, then add `journey` to the project's **Exposed schemas** setting (alongside `blank` and `repeat`) so PostgREST can serve the Worker requests. The table is protected by row level security and each request is scoped to the authenticated user's ID.

Journey entry listing returns `{ entries, nextCursor }`. Pass `limit` (up to 200), plus both `before_created_at` and `before_id` from `nextCursor`, to fetch older rows. The app's sync client follows these cursors until it has reconciled all pages.

## Scripts

- `pnpm --filter @ez/apps-api dev` - start Wrangler locally.
- `pnpm --filter @ez/apps-api check` - run TypeScript checks.
- `pnpm --filter @ez/apps-api test` - run API tests.
- `pnpm --filter @ez/apps-api deploy` - deploy with Wrangler.
