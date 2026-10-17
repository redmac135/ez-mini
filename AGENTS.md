# Project requirements

## Startup and local-first behavior

- Keep the first interactive app render independent of asynchronous work. Startup must not await any asynchronous operation, including network authentication, account lookup, local hydration, or remote synchronization.
- Render from locally available state first. Start local hydration and remote work in the background, then apply their results when they finish. Never gate the app shell or basic navigation on those tasks completing.
- Startup auth checks must not disable the app or its navigation while cached/local state is available. Only a user action that needs a network request may show a busy state.
- Preserve locally saved work when the network is unavailable. Queue or retry remote synchronization without blocking local edits.

## Offline behavior

- Core app content and local editing must remain usable offline.
- Open dialogs synchronously when a user requests them. If an action needs a network and the browser is offline, keep the relevant dialog open and show a clear offline message with a retry path when applicable.
- Do not navigate to an OAuth provider while offline, and do not present a network failure as a successful sign-in or connection.
- Listen for connectivity changes where needed so users can retry after reconnecting.

## Verification

- Cover cold startup with network requests unavailable and confirm the app renders from local state without waiting for remote work.
- Cover opening Login and attempting sign-in while offline; confirm the dialog appears immediately, explains the offline state, and does not start a network request or browser redirect.
- Keep OAuth failure, account transition, and identity-management states covered by tests and browser-level tests.
