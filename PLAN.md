# GitHub and Microsoft sign-in and connected accounts

## Goal

Offer GitHub and Microsoft sign-in alongside the existing email one-time-code flow, and let a signed-in user manage the sign-in identities attached to their Supabase account. Keep the existing local account switcher behavior and the API's server-managed session cookies.

## Current app shape

- `packages/ui/src/lib/LoginModal.svelte` is the shared email/OTP modal. `AccountModal.svelte` handles local account sessions and “Sign into another account”. `AccountDialogs.svelte` wires those dialogs to `packages/account`.
- The apps have a top-right settings menu. The blank app has editor settings plus login/switch/logout; Repeat and Journey have similar account menus. This is a natural entry point for a **Connected accounts** screen, but it should be distinct from switching or logging out local sessions.
- `packages/auth` talks to the Cloudflare Worker API. `apps/api/src/auth/routes.ts` calls Supabase Auth's HTTP endpoints, while `session-store.ts` holds Supabase access/refresh tokens in the device's KV-backed sessions and sets the active-session cookie. There is no browser Supabase client today.
- All three apps already point at the same `https://mini.api.ethanzhao.ca/v1` API in production and make credentialed requests. The API owns the device and active-session cookies, so the shared API cookie jar and device-scoped KV session list are the source of truth across apps in the same browser profile.
- Existing sign-in is email OTP (`/auth/login` then `/auth/verify`). Successful sign-in creates a device session. App data and RLS are scoped to the Supabase user ID.

## Product model and UX

Treat these as two separate operations:

1. **Sign in / add an account:** authenticate as a Supabase user and establish a local session on this device. Show “Continue with GitHub” and “Continue with Microsoft” below the email field in the Login modal and the add-account flow. Keep the email OTP option. Preserve the current account until OAuth succeeds; then add/select the returned session without losing the previous account's session. Handle the case where OAuth resolves to a Supabase user already in the device's account list without creating confusing duplicate rows.
2. **Connect a provider:** while signed into one Supabase user, attach a GitHub or Microsoft identity to that same user. Add **Connected accounts** to the top-right settings dropdown in each app. The screen should show connected providers and useful non-sensitive metadata (provider and, where available, username/email), offer “Connect GitHub/Microsoft” for unlinked providers, and allow disconnecting linked identities.

Make the distinction clear in labels and confirmation copy. Connecting an identity affects that Supabase user across devices; logging out/removing a local session only affects this device. A provider button in the add-account flow must not silently link that provider to the currently active account.

### Cross-app session requirement

`mini.api.ethanzhao.ca/v1` is the shared auth/session service for Blank, Repeat, and Journey. The intended result is one device-scoped session list and one active-session selection shared by all those apps in the same browser profile: sign in or add an account in any app, and the other apps see the same session count/list and active user when they next refresh auth state. Do not create per-app OAuth sessions, duplicate a successful login once per app, or store the auth cookies on the individual app origins. OAuth callbacks should return through the shared API host so its existing HttpOnly cookies and device ID remain authoritative.

The session list belongs to one browser profile/device cookie, not to all of a user's devices. A separate browser profile/device should retain its own session list. On auth changes, refresh or broadcast the shared API session state so already-open apps update their active user and reload the correct user-scoped data safely.

### Login and add-account modal

- Keep provider actions below the email input and visually separate them from the email/OTP submit action with a short divider label such as “or continue with”. Use recognizable provider marks, but give every icon-only mark a visible text label and accessible name; don't rely on color alone.
- Use the provider's display name in button text. Provide loading state, disable repeat submissions, and show a recoverable error if the user cancels, denies consent, or OAuth fails. Preserve the email draft when returning from an interrupted attempt where possible.
- On the OTP step, decide whether provider buttons remain hidden (recommended) to avoid competing flows.
- On provider return, show success in the same app route and complete the existing account data loading/context transition before allowing another account action.

### Connected accounts settings

- Show this option only when a real account is active; anonymous/local-only mode has no Supabase identities to manage. If settings is unreachable from the account modal, retain an obvious path back to the app's settings menu.
- List identity rows with provider, display name/email when present, and connected state. Do not expose OAuth access or refresh tokens.
- Ask for confirmation before disconnecting and explain the account-wide effect. Require a fresh sign-in/re-authentication for sensitive changes if Supabase's supported flow or the threat model requires it.
- Never permit disconnecting the final usable sign-in method. Supabase's unlink operation requires at least two identities, but the product should also make sure the remaining identity is one the user can actually use (email OTP is currently enabled). Show a clear explanation and route the user to connect another method first.
- Report provider configuration problems separately from user-cancelled OAuth and from a provider identity already linked to another Supabase user.

## Identity and account-linking rules

- A Supabase **user** is the durable account owning synced data. An app **session row** is a device-local login session. A provider identity is a credential attached to a user. Do not conflate these records.
- GitHub/Microsoft social sign-in itself is a standard, documented Supabase Auth feature. The beta callout applies specifically to **manual identity linking** (attaching another provider identity to an already signed-in Supabase user) and its corresponding management flow. Supabase's separate **OAuth Apps / OAuth 2.1 Server** feature makes Supabase an identity provider for third-party clients; that is the opposite direction and is not needed for this app's GitHub/Microsoft login.
- For a user who is already signed in, use Supabase Auth's manual identity-linking flow to link an OAuth identity. Supabase documents manual linking as beta and says it must be enabled in Auth configuration; confirm its current status/support and behavior in this project before implementation.
- For standalone OAuth sign-in, Supabase may automatically link a provider identity when its email is verified and matches an existing account. Never implement custom email-only linking in app code. Test verified, missing, unverified, and mismatched provider email cases. Do not merge Supabase users or migrate user data as part of this feature.
- Define the expected UX when a provider identity is already owned by a different Supabase user: stop, explain that it belongs to another account, and ask the person to sign in to that account. Never move the identity or merge data implicitly.
- Verify whether GitHub returns a usable verified email for the intended account; request only scopes needed for authentication. Microsoft sign-in needs the `email` scope for Supabase Auth. Do not request provider API scopes (repository, mail, calendar, etc.) unless a separate feature needs them.

## Recommended implementation architecture

Keep the OAuth callback and token exchange inside the trusted API Worker to match the existing custom auth/session architecture. Use authorization code with PKCE, one-time `state`, and a short-lived verifier/intent record bound to the initiating browser/device and the selected app return route. Validate that the callback matches the saved provider, intent (new sign-in vs link-to-current-user), state, and initiating device/session; reject replay, expiration, cross-provider, and cross-session callbacks. Validate all post-auth return destinations against a fixed allowlist of app origins to prevent open redirects. The callback must use the shared API host and preserve the browser's API cookies so a successful OAuth login updates the same device-scoped session list every app uses.

On successful new sign-in, validate/exchange the Supabase result, then create or reuse the appropriate device-level `StoredSession` and activate it with the existing shared API cookie. Preserve existing sessions. If the user is already represented in the shared device list, define reuse/activation behavior so another app's login does not create an app-specific duplicate. On successful linking, use the current authenticated Supabase session to link the provider identity to that same user and refresh the identity list; do not create or switch a local app account. Keep provider client secrets in Supabase Auth configuration, never in app bundles, source control, Wrangler vars, or API responses. Only retain provider tokens if a separately approved feature needs to call provider APIs; sign-in alone does not need them.

Before implementation, do a small API spike to confirm the supported Supabase Auth endpoints/client behavior for initiating OAuth, PKCE exchange, manual identity linking, listing identities, and unlinking while Supabase tokens are held in the Worker KV session store. Avoid putting Supabase OAuth tokens in URL fragments or local storage. Account for the shared API cookie jar, credentialed cross-origin app/API requests, and redirects across all supported app origins plus local dev.

Likely code areas once implementation is authorized:

- `packages/auth/src/index.ts`: OAuth start/link/unlink/list client methods and callback/result handling.
- `packages/account/src/index.ts`: add OAuth flow state/actions and identity-management state without breaking session switching.
- `packages/ui/src/lib/LoginModal.svelte`, `AccountDialogs.svelte`, and a new connected-account settings modal/component.
- Top-right menu in `apps/ez-blank`, `apps/ez-repeat`, and `apps/ez-journey` (and any additional shipped app using `@ez/account`).
- `apps/api/src/auth/routes.ts`, `session-store.ts`, `types.ts`, and `index.ts`: safe start/callback and identity management endpoints, PKCE state storage, token exchange, and cookie/session handling.
- Existing auth/account/API tests and Storybook stories for cancellation, callback errors, session preservation, linking, unlinking, and minimum sign-in method.

## Provider client and Supabase setup checklist

Do this outside source control; values are secrets and must not go into `PLAN.md` or commits.

### GitHub

1. Register a GitHub OAuth App for the product. Use the public product URL for its homepage.
2. Set **Authorization callback URL** to the Supabase Auth callback shown in the project's GitHub provider configuration: `https://<project-ref>.supabase.co/auth/v1/callback`. This is GitHub → Supabase, not Supabase → app.
3. Copy the GitHub Client ID and generate a client secret. Save the secret securely.
4. In Supabase Dashboard → Authentication → Sign In / Providers → GitHub, enable GitHub and enter the Client ID and client secret.
5. In Supabase Auth URL Configuration, add the API callback URL used by this implementation (`https://mini.api.ethanzhao.ca/v1/auth/oauth/callback*`, plus the localhost API callback for development). Keep the production Site URL pointed at the canonical app. Do not use broad production wildcards.
6. If local and production provider callbacks cannot share one GitHub OAuth App configuration cleanly, register a separate development OAuth App and configure the matching Supabase environment/project. Confirm redirect URI behavior before relying on this split.

### Microsoft Entra ID

1. In Microsoft Entra ID → App registrations, register a web application. Choose supported account types deliberately: personal Microsoft accounts, work/school accounts, or both, based on the intended audience. The recommended default for a broadly available personal app is both, if product access policy allows it.
2. Add the Supabase Auth callback shown by the Azure provider settings as a **Web** redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Create a client secret; record its **Value** (not its Secret ID), expiry date, and rotation owner/reminder.
4. In Supabase Dashboard → Authentication → Sign In / Providers → Azure, enable it and enter the Application (client) ID and secret. Set the tenant URL to `common` for both personal/work accounts, `consumers` for personal-only, or the specific tenant for an organization-only deployment.
5. Ensure the OAuth request includes `email`. Add the API callback path to Supabase Auth's redirect allowlist as above. Test the account types and tenant restrictions using real test accounts.

### Shared Supabase configuration

- Obtain each provider's exact Supabase callback URI from the dashboard and register that URI at the provider. Provider callback and app return/redirect URL are two different hops.
- Add the API Worker's OAuth callback to Supabase Auth → URL Configuration, including the flow query parameter (use a narrow callback-path wildcard if required by Supabase's redirect matching): production `https://mini.api.ethanzhao.ca/v1/auth/oauth/callback*`, development `http://localhost:1350/v1/auth/oauth/callback*`. Supabase redirects only to this API callback; the Worker then validates the final app return origin against `CORS_ORIGINS` and redirects to Blank, Repeat, Journey, or a permitted localhost app origin.
- Register the Supabase Auth callback URI with both external providers: `https://<project-ref>.supabase.co/auth/v1/callback` (copy the exact value from the provider's Supabase Dashboard panel). This provider callback is distinct from the API callback above.
- Enable manual identity linking only after confirming beta availability and testing link/unlink behavior for email OTP users. If it is unavailable or unsuitable, decide whether to defer connected-account management; do not emulate it by editing auth tables directly.
- Keep distinct provider credentials for development and production where practical. Document where credentials are stored, who can rotate them, and how to replace expiring Microsoft secrets without downtime.
- Check signup policy, email confirmation behavior, rate limits, provider branding/consent screens, and Supabase Auth redirect allowlists before enabling the buttons in production.

## Security, reliability, and edge cases

- State is random, one-time, short-lived, and bound to the intended operation and device/session. Enforce CSRF protections on start/link/unlink endpoints; callback errors must not activate a session.
- Validate callback issuer/provider and ensure an account-link callback returns to the same authenticated Supabase user who initiated it. A changed/expired active session should abort linking.
- Reuse the existing device-scoped session cookie model at `mini.api.ethanzhao.ca`; all apps must observe the same API-owned HttpOnly session and device cookies. Set secure, SameSite cookies as currently configured; test the real production domains and callback host.
- Preserve all existing device sessions on OAuth failure or cancellation. On success, do not sign out the old Supabase session as a side effect.
- Handle expired codes, denied consent, duplicate linking, provider outages, missing verified email, disabled provider, expired Microsoft secret, stale state, repeated callback, and browser Back/reload.
- Do not log OAuth codes, state/verifier values, client secrets, access tokens, refresh tokens, or raw provider profile payloads.
- Verify cross-tab and cross-app session broadcasts/refreshes and active-account updates after OAuth creates or reuses a device session or changes linked identities. Assert that the same browser profile sees the same session count from every app.

## Delivery sequence

1. **Confirm decisions and spike:** confirm providers/account audience, all supported app origins, manual linking availability, Supabase endpoints/SDK strategy, and device/session behavior.
2. **Configure providers:** create GitHub and Microsoft clients, configure Supabase providers and the shared API callback allowlist, record secret ownership and rotation, and ensure the Worker return-origin allowlist contains each shipped app.
3. **Backend OAuth:** implement PKCE/state start and callback, session establishment for login/add-account, and authenticated list/link/unlink endpoints.
4. **Auth/account controller:** model provider flow states, errors, identity list, and refresh behavior.
5. **UI:** add provider buttons and identity management settings to all shipped app menus, with accessibility, confirmation, loading, and cancellation handling.
6. **Validate:** add automated coverage and browser-level checks for OTP regression, OAuth success/cancel/error, multiple device sessions, duplicate provider identity, link/unlink, final-method protection, account-data scoping, and cross-app consistency: log in/add an account in one app, then verify the identical session list/count and active user in the other apps using the same browser profile. Test provider setup in a non-production Supabase environment before production.
7. **Release:** enable providers and deploy backend before exposing UI buttons; verify monitoring without logging credentials/tokens and document secret rotation.

## Decisions to settle before coding

- Should Microsoft support personal accounts and work/school accounts, or only one audience?
- Are Blank, Repeat, Journey, and Action all in scope for account management and OAuth return URLs?
- If OAuth resolves to a Supabase user already in this browser profile's shared session list, reuse/select the existing device session rather than adding a duplicate entry.
- Is Supabase manual identity linking acceptable while its documentation labels it beta, or should connected-account management wait for a stable supported path?
- Which GitHub scopes are necessary? Recommended initial scope: sign-in only, with no repository access.

## References

- [Supabase GitHub provider setup](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Supabase Azure/Microsoft provider setup](https://supabase.com/docs/guides/auth/social-login/auth-azure)
- [Supabase identity linking and unlinking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase Auth redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Supabase server-side Auth guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [GitHub OAuth redirect URI troubleshooting](https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/troubleshooting-authorization-request-errors)
