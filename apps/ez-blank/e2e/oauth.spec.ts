import { expect, test, type Page, type Route } from 'playwright/test';

const activeSession = {
	sessionId: 'session-a',
	userId: 'user-a',
	email: 'taylor@example.com',
	username: 'Taylor',
	createdAt: 1,
	lastUsedAt: 2,
	active: true
};

const identities = [
	{
		id: 'email-identity',
		provider: 'email',
		displayName: 'Taylor',
		email: 'taylor@example.com',
		createdAt: '2026-01-01T00:00:00.000Z'
	},
	{
		id: 'github-identity',
		provider: 'github',
		displayName: 'taylor-dev',
		email: 'taylor@example.com',
		createdAt: '2026-01-02T00:00:00.000Z'
	}
];

test('login dialog starts a provider sign-in redirect', async ({ page }) => {
	await mockApi(page);
	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Login' }).click();
	await page.getByRole('dialog', { name: 'Login' }).waitFor();

	await page.getByRole('button', { name: 'GitHub' }).click();

	await expect(page.getByRole('heading', { name: 'Mock provider authorization' })).toBeVisible();
	await expect(page).toHaveURL(/mock-oauth\?provider=github/);
});

test('cold offline startup renders the editor and login stays local until reconnect', async ({
	page
}) => {
	let sessionRequests = 0;
	let accountRequests = 0;
	let oauthRequests = 0;
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
	});
	await mockApi(page, async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		if (pathname.endsWith('/auth/session')) sessionRequests += 1;
		if (pathname.endsWith('/auth/accounts')) accountRequests += 1;
		if (pathname.endsWith('/auth/oauth/start')) oauthRequests += 1;
		await route.fulfill({ json: { activeSession: null, sessions: [] } });
	});
	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Login' }).click();

	const login = page.getByRole('dialog', { name: 'Login' });
	await expect(login).toBeVisible();
	await expect(
		login.getByText("You're offline. Connect to the internet to continue.")
	).toBeVisible();
	await login.getByRole('button', { name: 'GitHub' }).click();
	await expect(login).toBeVisible();
	await expect(page).not.toHaveURL(/mock-oauth/);
	await expect.poll(() => [sessionRequests, accountRequests, oauthRequests]).toEqual([0, 0, 0]);
});

test('OAuth startup failure returns to login with an app-visible message', async ({ page }) => {
	await mockApi(page, async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		if (pathname.endsWith('/auth/session') || pathname.endsWith('/auth/accounts')) {
			await route.fulfill({ json: { activeSession: null, sessions: [] } });
			return;
		}
		if (pathname.endsWith('/auth/oauth/start')) {
			await route.fulfill({
				status: 302,
				headers: {
					location: 'http://localhost:1351/?oauth=error&oauth_reason=provider_start_failed'
				}
			});
			return;
		}
		await route.fulfill({ json: {} });
	});
	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Login' }).click();
	await page.getByRole('dialog', { name: 'Login' }).getByRole('button', { name: 'GitHub' }).click();

	const login = page.getByRole('dialog', { name: 'Login' });
	await expect(login).toBeVisible();
	await expect(
		login.getByText('Unable to start provider sign-in. Please try again.')
	).toBeVisible();
});

test('cancelled OAuth linking keeps profile open and shows a retryable toast', async ({ page }) => {
	await mockApi(
		page,
		async (route) => {
			const request = route.request();
			const pathname = new URL(request.url()).pathname;
			if (pathname.endsWith('/auth/session') || pathname.endsWith('/auth/accounts')) {
				await route.fulfill({ json: { activeSession, sessions: [activeSession] } });
				return;
			}
			if (pathname.endsWith('/auth/identities')) {
				await route.fulfill({ json: { identities } });
				return;
			}
			await route.fulfill({ json: {} });
		},
		true
	);
	await page.goto('/?oauth=error&oauth_reason=cancelled&oauth_intent=link');

	const profile = page.getByRole('dialog', { name: 'Profile' });
	await expect(profile).toBeVisible();
	await expect(page.getByText('Failed to connect. Please try again.')).toBeVisible();
	await expect(profile.getByRole('alert')).toHaveCount(0);
	const toastLayer = page.locator('.toast-stack');
	const toastZIndex = await toastLayer.evaluate((element) =>
		Number(getComputedStyle(element).zIndex)
	);
	const profileZIndex = await profile.evaluate((element) =>
		Number(getComputedStyle(element).zIndex)
	);
	expect(toastZIndex).toBeGreaterThan(profileZIndex);
	await expect(profile.getByRole('button', { name: '+ Microsoft' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Login' })).toHaveCount(0);
});

test('plain page refresh does not create a pending OAuth link result', async ({ page }) => {
	await mockApi(page, undefined, true);
	await page.goto('/');

	await expect(page.getByRole('dialog', { name: 'Profile' })).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Login' })).toHaveCount(0);
});

test('OAuth return for the current account opens an already-signed-in confirmation', async ({
	page
}) => {
	await mockApi(page, undefined, true);
	await page.goto('/?oauth=success&oauth_reason=already_signed_in');

	const accounts = page.getByRole('dialog', { name: 'Accounts' });
	await expect(accounts.getByText('Already signed into this account.')).toBeVisible();
	await expect(accounts.getByRole('button', { name: 'Taylor taylor@example.com' })).toBeVisible();
	await expect(page).not.toHaveURL(/oauth_reason/);
});

test('adding an existing account confirms it, and adding another account keeps both available', async ({
	page
}) => {
	const nextSession = {
		...activeSession,
		sessionId: 'session-b',
		userId: 'user-b',
		email: 'b@example.com',
		username: 'b@example.com',
		active: true
	};
	let currentSessions = [activeSession];
	let currentActiveSession = activeSession;
	await mockApi(
		page,
		async (route) => {
			const pathname = new URL(route.request().url()).pathname;
			if (pathname.endsWith('/auth/session') || pathname.endsWith('/auth/accounts')) {
				await route.fulfill({
					json: { activeSession: currentActiveSession, sessions: currentSessions }
				});
				return;
			}
			if (pathname.endsWith('/auth/login')) {
				await route.fulfill({ json: { sent: true } });
				return;
			}
			if (pathname.endsWith('/auth/verify')) {
				const email = route.request().postDataJSON().email;
				if (email === activeSession.email) {
					await route.fulfill({
						json: {
							activeSession,
							sessions: [activeSession],
							alreadySignedIn: true
						}
					});
					return;
				}
				currentSessions = [{ ...activeSession, active: false }, nextSession];
				currentActiveSession = nextSession;
				await route.fulfill({
					json: {
						activeSession: nextSession,
						sessions: [{ ...activeSession, active: false }, nextSession]
					}
				});
				return;
			}
			await route.fulfill({ json: {} });
		},
		true
	);
	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Switch Account' }).click();
	await page
		.getByRole('dialog', { name: 'Accounts' })
		.getByRole('button', { name: 'Sign into another account' })
		.click();
	await page.getByLabel('Email').fill('taylor@example.com');
	await page.getByRole('button', { name: 'Send Email' }).click();
	await page.getByLabel('8-digit verification code').fill('12345678');
	const alreadySignedIn = page.getByRole('dialog', { name: 'Accounts' });
	await expect(alreadySignedIn.getByText('Already signed into this account.')).toBeVisible();
	await page
		.getByRole('dialog', { name: 'Accounts' })
		.getByRole('button', { name: 'Sign into another account' })
		.click();
	await page.getByLabel('Email').fill('b@example.com');
	await page.getByRole('button', { name: 'Send Email' }).click();
	await page.getByLabel('8-digit verification code').fill('12345678');

	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Switch Account' }).click();
	const accounts = page.getByRole('dialog', { name: 'Accounts' });
	await expect(accounts.getByText('taylor@example.com')).toBeVisible();
	await expect(accounts.getByText('b@example.com')).toBeVisible();
});

test('profile can add and remove login methods', async ({ page }) => {
	let currentIdentities = [...identities];
	await mockApi(
		page,
		async (route) => {
			const request = route.request();
			const pathname = new URL(request.url()).pathname;
			if (pathname.endsWith('/auth/session')) {
				await route.fulfill({ json: { activeSession, sessions: [activeSession] } });
				return;
			}
			if (pathname.endsWith('/auth/identities') && request.method() === 'GET') {
				await route.fulfill({ json: { identities: currentIdentities } });
				return;
			}
			if (pathname.endsWith('/auth/identities/github-identity') && request.method() === 'DELETE') {
				currentIdentities = [identities[0]!];
				await route.fulfill({ json: { identities: currentIdentities } });
				return;
			}
			if (pathname.endsWith('/auth/oauth/link') && request.method() === 'POST') {
				await route.fulfill({
					json: { authorizationUrl: 'http://localhost:1350/v1/mock-oauth?provider=azure' }
				});
				return;
			}
			await route.fulfill({ json: {} });
		},
		true
	);
	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Profile' }).click();
	const dialog = page.getByRole('dialog', { name: 'Profile' });
	await expect(dialog.getByText('taylor-dev')).toBeVisible();

	await dialog.getByRole('button', { name: '+ Microsoft' }).click();
	await expect(page).toHaveURL(/mock-oauth\?provider=azure/);
	await expect(page.getByRole('heading', { name: 'Mock provider authorization' })).toBeVisible();

	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Profile' }).click();
	const reconnectDialog = page.getByRole('dialog', { name: 'Profile' });
	await reconnectDialog
		.locator('li')
		.filter({ hasText: 'GitHub' })
		.getByRole('button', { name: 'Disconnect' })
		.click();
	await page
		.getByRole('dialog', { name: 'Disconnect GitHub?' })
		.getByRole('button', { name: 'Disconnect' })
		.click();
	await expect(reconnectDialog.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
	await expect(page.getByText('Login method removed')).toBeVisible();
});

test('profile settings save the display name and cancel closes without saving', async ({
	page
}) => {
	let savedDisplayName = 'taylor-dev';
	await mockApi(
		page,
		async (route) => {
			const request = route.request();
			const pathname = new URL(request.url()).pathname;
			if (pathname.endsWith('/auth/session')) {
				await route.fulfill({ json: { activeSession, sessions: [activeSession] } });
				return;
			}
			if (pathname.endsWith('/auth/identities')) {
				await route.fulfill({ json: { identities } });
				return;
			}
			if (pathname.endsWith('/auth/profile') && request.method() === 'GET') {
				await route.fulfill({ json: { displayName: savedDisplayName, customDisplayName: null } });
				return;
			}
			if (pathname.endsWith('/auth/profile') && request.method() === 'PUT') {
				savedDisplayName = request.postDataJSON().displayName.trim();
				await route.fulfill({
					json: { displayName: savedDisplayName, customDisplayName: savedDisplayName }
				});
				return;
			}
			await route.fulfill({ json: {} });
		},
		true
	);
	await page.goto('/');
	await expect(page.getByRole('textbox', { name: 'Markdown editor' })).toBeVisible();
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Profile' }).click();
	let dialog = page.getByRole('dialog', { name: 'Profile' });
	const displayName = dialog.getByRole('textbox', { name: 'Display name' });
	await expect(displayName).toHaveValue('taylor-dev');
	const dialogBounds = await dialog.boundingBox();
	const inputBounds = await displayName.boundingBox();
	expect(dialogBounds).not.toBeNull();
	expect(inputBounds).not.toBeNull();
	expect(inputBounds!.x).toBeGreaterThanOrEqual(dialogBounds!.x);
	expect(inputBounds!.x + inputBounds!.width).toBeLessThanOrEqual(
		dialogBounds!.x + dialogBounds!.width
	);
	await displayName.fill('Discarded value');
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toHaveCount(0);
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await page.getByRole('button', { name: 'Profile' }).click();
	dialog = page.getByRole('dialog', { name: 'Profile' });
	const reopenedDisplayName = dialog.getByRole('textbox', { name: 'Display name' });
	await expect(reopenedDisplayName).toHaveValue('taylor-dev');
	await reopenedDisplayName.fill('Taylor');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByText('Profile saved')).toBeVisible();
	await page.getByRole('button', { name: 'Open editor settings' }).click();
	await expect(page.locator('.menu-stat')).toContainText('Taylor');
});

async function mockApi(
	page: Page,
	override?: (route: Route) => Promise<void>,
	authenticated = false
) {
	await page.route('http://localhost:1350/v1/**', async (route) => {
		if (override) {
			const pathname = new URL(route.request().url()).pathname;
			if (
				pathname.endsWith('/auth/identities') ||
				pathname.includes('/auth/identities/') ||
				pathname.endsWith('/auth/session') ||
				pathname.endsWith('/auth/accounts') ||
				pathname.endsWith('/auth/oauth/start') ||
				pathname.endsWith('/auth/oauth/link') ||
				pathname.endsWith('/auth/profile') ||
				pathname.endsWith('/auth/login') ||
				pathname.endsWith('/auth/verify')
			) {
				await override(route);
				return;
			}
		}
		if (
			route.request().url().endsWith('/auth/session') ||
			route.request().url().endsWith('/auth/accounts')
		) {
			await route.fulfill({
				json: {
					activeSession: authenticated ? activeSession : null,
					sessions: authenticated ? [activeSession] : []
				}
			});
			return;
		}
		if (route.request().url().includes('/auth/oauth/start?')) {
			const provider = new URL(route.request().url()).searchParams.get('provider');
			await route.fulfill({
				status: 302,
				headers: { location: `http://localhost:1350/v1/mock-oauth?provider=${provider}` }
			});
			return;
		}
		if (new URL(route.request().url()).pathname.endsWith('/mock-oauth')) {
			await route.fulfill({
				contentType: 'text/html',
				body: '<h1>Mock provider authorization</h1>'
			});
			return;
		}
		await route.fulfill({ json: {} });
	});
}
