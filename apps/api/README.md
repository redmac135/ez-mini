# ez-mini API

Cloudflare Worker API for ez-mini auth sessions, settings, and app data sync.

Routes are served under `/v1`.

## Development

Run from the repo root:

```sh
pnpm --filter @ez/apps-api dev
```

The dev script starts Wrangler with the `development` environment from `wrangler.toml`,
which sets localhost CORS for the apps.

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

The Worker also needs a `SESSIONS` KV namespace and `IDENTITY_UNLINKER` Durable Object binding, configured in `wrangler.toml`.
OAuth callbacks use `API_PUBLIC_URL` (the API origin without `/v1`); set it to the local API URL for development. Configure GitHub and Microsoft credentials in Supabase Auth; provider secrets do not belong in Worker variables. Add the API callback (`/v1/auth/oauth/callback`) to Supabase's redirect allowlist and register Supabase's provider callback URL with each provider. The app return origins must be listed in `CORS_ORIGINS`.

OAuth sign-in and identity management use the same API-owned device and active-session cookies as email sign-in. Blank, Repeat, and Journey therefore share the device's account list in one browser profile. OAuth uses PKCE through the API callback, which validates the flow and app return origin. Linking and unlinking change the Supabase account's identities across devices; unlinking is rejected when only one identity remains. Adding a sign-in only adds or selects a session on the current device.

## API Shape

- `POST /v1/auth/login`
- `POST /v1/auth/verify`
- `GET /v1/auth/oauth/start?provider=github|azure&return_to=...` (redirects to provider authorization)
- `POST /v1/auth/oauth/link` (returns an authorization URL for linking to the active account)
- `GET /v1/auth/oauth/callback` (internal provider callback)
- `GET /v1/auth/session`
- `GET /v1/auth/accounts`
- `POST /v1/auth/switch`
- `POST /v1/auth/anonymous`
- `POST /v1/auth/logout`
- `GET /v1/auth/identities`
- `DELETE /v1/auth/identities/:identityId`
- `GET /v1/auth/profile`
- `PUT /v1/auth/profile`
- `GET /v1/pages`
- `POST /v1/pages`
- `GET /v1/journey/entries`
- `POST /v1/journey/entries`
- `GET /v1/settings`
- `PATCH /v1/settings`

The pages API only exposes collection list/upsert routes because `ez-blank` is the sole client and already represents deletes as soft-deleted upserted page rows.

Journey stores entries in the `journey.entries` table. Apply `supabase/migrations/20261014000000_journey_entries.sql` to the Supabase project, then add `journey` to the project's **Exposed schemas** setting (alongside `blank` and `repeat`) so PostgREST can serve the Worker requests. The table is protected by row level security and each request is scoped to the authenticated user's ID.

Journey entry listing returns `{ entries, nextCursor }`. Pass `limit` (up to 200), plus both `before_created_at` and `before_id` from `nextCursor`, to fetch older rows. The cursor orders entries by `(created_at, id)` so equally dated entries are not skipped. Sync requests can also pass `since` to fetch changed rows; the client follows pagination cursors until it has reconciled all pages. Writes include the last observed server change cursor, which the API checks before accepting updates. If both devices changed an entry, sync keeps the entry with the later `updated_at` timestamp.

## Scripts

- `pnpm --filter @ez/apps-api dev` - start Wrangler locally.
- `pnpm --filter @ez/apps-api check` - run TypeScript checks.
- `pnpm --filter @ez/apps-api test` - run API tests.
- `pnpm --filter @ez/apps-api deploy` - deploy with Wrangler.
