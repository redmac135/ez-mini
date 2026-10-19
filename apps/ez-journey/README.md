# ez journey

Journey is local-first. Entries are written to IndexedDB and remain available offline. Signing in prompts you to choose whether to claim entries created anonymously on this device. Signed-in entries sync through the Worker API and merge across devices by UUID. See the [API README](../api/README.md) for the sync and pagination contract.

Use Search to find saved entries across the full journal. The calendar marks dates with entries; browse months and years without changing the selected journal date, then select a day to jump to it and open its entry or an empty editor. The timeline loads nearby 30-entry pages as you scroll, and date jumps load the selected date with surrounding entries so scrolling can continue in either direction.

When closing an edited saved entry, Journey asks whether to discard unsaved changes. Cancel keeps the draft open; confirming discard closes the editor without changing the saved entry.

To load 120 development-only sample entries into an empty anonymous local Journey store, open `http://localhost:1353/?demo=journey`. This seeding is disabled in production builds and does not overwrite existing local entries.

The API expects the Supabase `journey` schema to be exposed to PostgREST. Apply the SQL migration documented in [the API README](../api/README.md) before deploying Journey sync.
