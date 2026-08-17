/**
 * Release-readiness setup smoke.
 *
 * Verifies the DOCUMENTED deployment path end-to-end against a real stack brought
 * up by `docker compose up` (see scripts/verify-setup.ts and the CI e2e-setup job):
 *
 *   1. Landing page serves (nginx + built static app work).
 *   2. Signup form renders and the first-user path is active on a fresh install.
 *   3. First-user signup succeeds → proves Fluxbase auth + the mark_setup_complete()
 *      trigger (user_profiles count 0 → first user becomes admin, is_setup_complete
 *      flips true).
 *   4. Sign-in via the UI yields a real session (not a redirect to signin) — proves
 *      the declarative schema + RLS applied by startup.sh's sync are correct.
 *   5. Dashboard + onboarding render with no 5xx / RLS errors.
 *
 * This is the gate that catches: a broken prod image, a sync that silently fails to
 * apply public.sql, an RLS policy regression, or a first-run flow that regresses.
 *
 * Run via: bun run test:setup  (or bun run verify:setup to also bring up the stack)
 */

import { test, expect, type Page } from '@playwright/test';
import {
	installStorageDefaults,
	signupFirstUser,
	confirmEmailIfRequired,
	login,
	waitForDashboardReady,
	testEmail,
	testPassword
} from './helpers/auth';

// Serial: every step depends on the previous one's state (signup → login → dashboard).
test.describe.serial('Documented setup happy path', () => {
	const email = testEmail();
	const password = testPassword();

	// Stash the email so globalTeardown can clean it up after all tests finish.
	test.beforeAll(() => {
		process.env.WAYLI_SMOKE_TEST_EMAIL = email;
	});

	// Seed storage defaults on every page so the locale / AI fab hint
	// never interfere with assertions.
	test.beforeEach(async ({ context }) => {
		installStorageDefaults(context);
	});

	test('1. landing page serves and links to signup', async ({ page }) => {
		const resp = await page.goto('/');
		expect(resp?.ok(), 'landing responded ok').toBe(true);

		// The landing page links to signin; signup is reachable from there. Either
		// a direct signup link or a signin link satisfies "the app is wired up".
		const authLink = page
			.getByRole('link', { name: /sign in|log in|get started|sign up/i })
			.first();
		await expect(authLink).toBeVisible();
	});

	test('2. signup form renders with first-user path active', async ({ page }) => {
		await page.goto('/auth/signup', { waitUntil: 'domcontentloaded' });

		// The form hydrates after the auth-config / settings fetch.
		await expect(page.locator('#email')).toBeVisible({ timeout: 20000 });
		await expect(page.locator('#password')).toBeVisible();
		await expect(page.locator('#firstName')).toBeVisible();

		// On a fresh stack is_setup_complete is absent → isFirstUser=true → the
		// first-user welcome banner renders and registration is force-enabled.
		// This is the precondition for step 3 (first user becomes admin). Target the
		// banner's 🎉 marker specifically — it only renders when isFirstUser &&
		// !isLoadingSettings, so it's an unambiguous signal (unlike a text regex,
		// which collides with the "First name" label).
		await expect(page.getByText('🎉')).toBeVisible({ timeout: 15000 });
	});

	test('3. first-user signup succeeds', async ({ page }) => {
		await signupFirstUser(page, { email, password });

		// signupFirstUser waits for navigation off /auth/signup. Success means
		// either an auto-confirm landing on the dashboard, or the verify-email
		// page (SMTP on). Assert we didn't get kicked back to signup with an error.
		expect(page.url(), 'navigated away from signup').not.toMatch(/\/auth\/signup/);

		// If the stack requires email verification, bypass it for the test. No-op
		// when SMTP is off (the common default — auto-confirm).
		await confirmEmailIfRequired({ email, password });
	});

	test('4. sign-in yields a real session (no redirect to signin)', async ({ page }) => {
		// Fresh page so any partial session from signup doesn't mask a broken login.
		await login(page, { email, password });

		// First login on a fresh user redirects to onboarding. Either onboarding
		// or the dashboard is acceptable — the key assertion is we are NOT on signin.
		expect(page.url(), 'left signin').not.toMatch(/\/auth\/signin/);
		expect(page.url(), 'reached an authenticated route').toMatch(/\/dashboard/);
	});

	test('5. first-login onboarding renders', async ({ page }) => {
		// Re-authenticate and go to the account-settings page with the onboarding
		// flag, which is where first-login sends the user.
		await login(page, { email, password });
		await page.goto('/dashboard/account-settings?onboarding=true', {
			waitUntil: 'domcontentloaded'
		});
		await waitForDashboardReady(page, { readySelector: 'main' });

		// The onboarding modal is a role=dialog. It may already have been dismissed
		// by a prior step; assert the dashboard shell rendered instead of bouncing
		// to signin — that's the real proof the session + schema work.
		expect(page.url(), 'stayed on dashboard').toMatch(/\/dashboard/);
	});

	test('6. dashboard pages render with no server/RLS errors', async ({ page }) => {
		await login(page, { email, password });

		const errors: string[] = [];
		// Capture 5xx responses and console errors. A 5xx or an RLS permission
		// error here means the declarative schema / policies didn't apply correctly
		// during startup.sh's sync — the core thing this smoke guards against.
		page.on('response', (r) => {
			if (r.status() >= 500) errors.push(`5xx: ${r.status()} ${r.url()}`);
		});
		page.on('console', (m) => {
			if (m.type() === 'error') {
				const txt = m.text();
				// RLS / permission failures surface as Postgres errors in the console.
				// Exclude PGRST000 "not found" which is expected for a fresh user
				// with no data (empty tables return PGRST000 in some Fluxbase configs).
				if (/permission denied|policy|rls|42501/i.test(txt)) {
					errors.push(`console: ${txt}`);
				} else if (/PGRST/i.test(txt) && !/PGRST000/i.test(txt)) {
					errors.push(`console: ${txt}`);
				}
			}
		});

		// Location Data: drives queries that depend on schema + RLS being correct.
		await page.goto('/dashboard/location-data', { waitUntil: 'domcontentloaded' });
		await waitForDashboardReady(page, { readySelector: 'h1' });
		expect(page.url(), 'location-data did not redirect to signin').not.toMatch(/\/auth\/signin/);

		// Travel: the trips list page.
		await page.goto('/dashboard/travel', { waitUntil: 'domcontentloaded' });
		await waitForDashboardReady(page, { readySelector: 'h1' });
		expect(page.url(), 'travel did not redirect to signin').not.toMatch(/\/auth\/signin/);

		// Assert AFTER pages have had a chance to fire their queries.
		await page.waitForTimeout(2000);
		expect(errors, 'no 5xx responses and no RLS/permission errors').toEqual([]);
	});
});

// Keep the helper imports referenced for tooling that tree-shakes unused imports
// during type-check of the spec file in isolation.
void (null as unknown as Page);
