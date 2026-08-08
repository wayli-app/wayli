/**
 * Reusable Playwright auth + app-ready helpers for Wayli E2E tests.
 *
 * Extracted from scripts/capture-screenshots.ts so the setup-verification smoke
 * and the screenshot capture share one source of truth for login, dashboard-readiness,
 * and storage seeding. Future work: have capture-screenshots.ts import these too.
 *
 * These helpers target a REAL running stack (the compose bring-up or `bun run dev`).
 * They use the Fluxbase SDK only for the service-role concerns the UI can't do itself
 * (email confirmation bypass, test-user teardown) — the actual signup and login flows
 * are driven through the browser so we verify the real user path.
 */

/* oxlint-disable no-await-in-loop -- several helpers await sequentially on purpose:
   waitForDashboardReady chains dependent waits, and wipeUserData deletes rows in
   FK-safe order (children before parents). Parallelizing either would race. */

import type { Page, BrowserContext } from '@playwright/test';
import { createClient } from '@nimbleflux/fluxbase-sdk';

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL =
	process.env.WAYLI_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4000';

// Fluxbase URL: prefer the explicit host override, then .env. The deploy .env ships
// `http://fluxbase:8080` (a Docker-internal hostname), which isn't reachable when
// helpers run on the host / CI runner. Remap the known container host to localhost.
const RAW_FLUXBASE_URL =
	process.env.FLUXBASE_PUBLIC_BASE_URL ||
	process.env.PUBLIC_FLUXBASE_URL ||
	'http://127.0.0.1:8080';
const FLUXBASE_URL = RAW_FLUXBASE_URL.replace('://fluxbase:', '://127.0.0.1:').replace(
	'://fluxbase-',
	'://127.0.0.1-'
);
const ANON_KEY = process.env.PUBLIC_FLUXBASE_ANON_KEY || process.env.FLUXBASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.FLUXBASE_SERVICE_ROLE_KEY || '';

// A password that always satisfies the default policy (8+, upper, lower, number, special).
const DEFAULT_TEST_PASSWORD = process.env.WAYLI_TEST_PASSWORD || 'Wayli-Test-123!';

export interface TestCreds {
	email: string;
	password: string;
}

/**
 * Build a unique-per-run test email so repeated runs against a persistent stack
 * don't collide. Override with WAYLI_TEST_EMAIL for a fixed address.
 */
export function testEmail(): string {
	return process.env.WAYLI_TEST_EMAIL || `e2e-setup-${Date.now()}@wayli.test`;
}

export function testPassword(): string {
	return DEFAULT_TEST_PASSWORD;
}

/** Base URL the app is served at (Playwright's baseURL). */
export function baseUrl(): string {
	return BASE_URL;
}

// ── Service-role client (for setup-only operations the UI can't do) ──────────

function adminClient() {
	if (!SERVICE_ROLE_KEY) {
		throw new Error(
			'FLUXBASE_SERVICE_ROLE_KEY is required for email-confirmation bypass and teardown. ' +
				'Set it in web/.env (the smoke stack generate-keys.sh output writes it).'
		);
	}
	return createClient(FLUXBASE_URL, SERVICE_ROLE_KEY, {
		auth: { autoRefresh: false, persist: false }
	});
}

// ── Browser-context seeding ─────────────────────────────────────────────────

/**
 * Pre-seed localStorage so the storage-notice banner never renders and the locale
 * loads deterministically. Applied to every page in the context via initScript.
 * Lifted from capture-screenshots.ts.
 */
export function installStorageDefaults(ctx: BrowserContext): void {
	ctx.addInitScript(() => {
		try {
			localStorage.setItem('wayli-storage-notice-dismissed', 'true');
			localStorage.setItem('wayli-locale', 'en');
			localStorage.setItem('wayli.ai.fab_hint_dismissed', '1');
		} catch {
			/* ignore — page may not have localStorage yet */
		}
	});
}

// ── Dashboard readiness ─────────────────────────────────────────────────────

interface DashboardReadyOpts {
	/** Selector that must be present AND visible before continuing. */
	readySelector?: string;
}

/**
 * Wait until a dashboard page is genuinely ready: i18n messages loaded (so nav/labels
 * resolve instead of showing raw keys), the admin-check spinner gone, and the page's
 * readySelector visible. Throws if the page redirected to signin (not authenticated).
 * Lifted from capture-screenshots.ts.
 */
export async function waitForDashboardReady(
	page: Page,
	opts: DashboardReadyOpts = {}
): Promise<void> {
	// 1. Wait for i18n: the app fetches /messages/<locale>.json. Until then, labels
	//    show raw keys. Best-effort — some pages may have already loaded it.
	await page
		.waitForResponse((r) => r.url().includes('/messages/') && r.status() === 200, {
			timeout: 15000
		})
		.catch(() => {});

	// 2. Wait for the admin-check / init spinner to disappear.
	await page
		.locator('.animate-spin')
		.first()
		.waitFor({ state: 'detached', timeout: 20000 })
		.catch(() => {});

	// 3. Guard: if we got bounced to signin, this page can't be reached.
	if (page.url().includes('/auth/signin')) {
		throw new Error(`redirected to signin — not authenticated for ${page.url()}`);
	}

	// 4. Wait for the page-specific ready selector.
	if (opts.readySelector) {
		await page
			.locator(opts.readySelector)
			.first()
			.waitFor({ state: 'visible', timeout: 15000 })
			.catch(() => {});
	}
}

// ── Auth flows (driven through the real UI) ─────────────────────────────────

/**
 * Submit the signup form as the first user. Drives the real /auth/signup page so the
 * test verifies the actual first-user → admin → mark_setup_complete path. Returns
 * once the post-signup navigation settles. If email verification is required, the
 * page redirects to /auth/verify-email; call confirmEmailIfRequired() then login().
 */
export async function signupFirstUser(page: Page, { email, password }: TestCreds): Promise<void> {
	await page.goto(`${BASE_URL}/auth/signup`, { waitUntil: 'domcontentloaded' });

	// The signup form hydrates after the auth-config / settings fetch, so wait for
	// the first-name input to appear (it's only rendered once settings have loaded
	// and registration isn't disabled).
	const firstName = page.locator('#firstName');
	await firstName.waitFor({ state: 'visible', timeout: 20000 });

	await firstName.fill('Setup');
	await page.locator('#lastName').fill('Verifier');
	await page.locator('#email').fill(email);
	await page.locator('#password').fill(password);
	await page.locator('#confirmPassword').fill(password);

	// Submit via Enter on the confirm field (most reliable trigger; the visible
	// submit button can be shadowed by the password-toggle button).
	await page.locator('#confirmPassword').press('Enter');

	// Wait for navigation away from signup. On success the user either lands on
	// the dashboard (auto-confirmed) or the verify-email page (SMTP enabled).
	await page.waitForURL((url) => !url.pathname.startsWith('/auth/signup'), { timeout: 30000 });
}

/**
 * If Fluxbase is configured to require email verification, the freshly-signed-up user
 * has email_verified=false and can't sign in. We can't force-confirm via the
 * service-role key alone (the auth-admin surface needs admin-auth, per the note in
 * scripts/seed-screenshots.ts), so instead we DETECT the situation and surface a
 * clear, actionable message.
 *
 * In practice this is a no-op for the documented setup: the compose `.env.example`
 * ships with SMTP disabled, so Fluxbase auto-confirms new users and the test signs
 * in directly. If an operator enables SMTP without providing a way to confirm the
 * test user, the login step will fail with a readable error pointing here.
 */
export async function confirmEmailIfRequired({ email }: TestCreds): Promise<void> {
	// Probe: can we sign in right now? If yes, the user is confirmed and we're done.
	// If no and the error mentions verification, emit guidance — do NOT fail here,
	// let the spec's own login attempt produce the canonical failure.
	//
	// Best-effort: if the anon key isn't wired into the test process env (e.g. a CI
	// step forgot to pass it), skip the probe entirely rather than crash the whole
	// smoke — the signup flow's own auto-confirm path still gets exercised.
	if (!ANON_KEY) {
		console.warn('  ⚠️ Skipping email-confirm probe: no FLUXBASE_ANON_KEY in env.');
		return;
	}
	let anon;
	try {
		anon = createClient(FLUXBASE_URL, ANON_KEY, {
			auth: { autoRefresh: false, persist: false }
		});
	} catch (err) {
		console.warn('  ⚠️ Skipping email-confirm probe:', (err as Error)?.message);
		return;
	}
	const { error } = await anon.auth.signInWithPassword({ email, password: testPassword() });
	if (!error) return; // confirmed — nothing to do
	const msg = (error as any)?.message ?? String(error);
	if (/verify|confirm|not confirmed|email/i.test(msg)) {
		console.warn(
			`  ⚠️ Signup appears to require email verification for ${email}.\n` +
				'    The smoke assumes the documented default (SMTP disabled → auto-confirm).\n' +
				'    If you enabled SMTP, confirm the test user manually or disable SMTP for the smoke run.'
		);
	}
}

/**
 * Log in via the real /auth/signin form. Waits for navigation away from signin as the
 * source of truth for a successful login (a silent failure here would make every
 * subsequent assertion capture the signin page instead). Lifted from capture-screenshots.ts.
 */
export async function login(page: Page, { email, password }: TestCreds): Promise<void> {
	await page.goto(`${BASE_URL}/auth/signin`, { waitUntil: 'domcontentloaded' });

	// The signin form hydrates after domcontentloaded (gated on i18n / auth-state).
	const emailInput = page.locator('#email');
	await emailInput.waitFor({ state: 'visible', timeout: 15000 });
	const pwInput = page.locator('#password');
	await pwInput.waitFor({ state: 'visible', timeout: 15000 });

	await emailInput.fill(email);
	await pwInput.fill(password);
	// Submit via Enter on the password field — most reliable trigger (the visible
	// submit button can be shadowed by the password-toggle button).
	await pwInput.press('Enter');

	// Wait for navigation away from signin. Don't swallow this — a silent failure
	// here makes every following assertion capture the signin page.
	await page.waitForURL((url) => !url.pathname.startsWith('/auth/signin'), { timeout: 30000 });
	// Let the session rehydrate + dashboard mount settle.
	await page.waitForTimeout(2000);
}

// ── Teardown ────────────────────────────────────────────────────────────────

/**
 * Delete a test user's app-owned rows so repeated runs against a persistent stack
 * stay clean. Mirrors the table list from scripts/seed-screenshots.ts wipeUserData().
 *
 * Belt-and-suspenders: the smoke stack's volumes are destroyed on teardown anyway,
 * but this keeps `test:setup` (run against a long-lived dev stack) safe to repeat.
 * We can't resolve the user id from email via the admin API without admin-auth, so
 * we resolve it the same way the seeder detects users — a password sign-in probe —
 * then delete app rows by that id with the service-role client (bypasses RLS).
 * The auth.users row is intentionally left behind; on the ephemeral smoke stack it
 * dies with the Postgres volume.
 */
export async function wipeUserData(email: string): Promise<void> {
	try {
		// Resolve the user id via a sign-in probe (idempotent; no session persisted).
		const anon = createClient(FLUXBASE_URL, ANON_KEY, {
			auth: { autoRefresh: false, persist: false }
		});
		const { data, error } = await anon.auth.signInWithPassword({
			email,
			password: testPassword()
		});
		// signInWithPassword returns a union (AuthResponseData | SignInWith2FAResponse);
		// narrow to the shape that carries a user id.
		const userId = (data as any)?.user?.id as string | undefined;
		if (error || !userId) {
			return; // user already gone or not confirmable — nothing to wipe
		}

		const admin = adminClient();
		const tables = [
			'trip_plan_items',
			'trip_entries',
			'trip_likes',
			'trip_comments',
			'trip_collaborators',
			'trip_shares',
			'want_to_visit_places',
			'tracker_daily_activity',
			'tracker_data',
			'trips',
			'user_preferences',
			'user_profiles'
		];
		for (const t of tables) {
			await admin
				.from(t)
				.delete()
				.eq('user_id', userId)
				.then(({ error: delError }) => {
					if (delError) console.warn(`  teardown: ${t} delete:`, (delError as any)?.message);
				});
		}
	} catch (err) {
		console.warn('  ⚠️ teardown wipeUserData failed (non-fatal):', (err as Error)?.message);
	}
}
