# ez journey

Journey is local-first. Entries are written to IndexedDB and remain available offline. Signing in prompts you to choose whether to claim entries created anonymously on this device. Signed-in entries sync through the Worker API and merge across devices by UUID. See the [API README](../api/README.md) for the sync and pagination contract.

The timeline renders local pages of 30 entries and loads older pages as you scroll.

To load 120 development-only sample entries into an empty anonymous local Journey store, open `http://localhost:1353/?demo=journey`. This seeding is disabled in production builds and does not overwrite existing local entries.

The API expects the Supabase `journey` schema to be exposed to PostgREST. Apply the SQL migration documented in [the API README](../api/README.md) before deploying Journey sync.
