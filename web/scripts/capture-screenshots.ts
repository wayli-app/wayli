/**
 * Playwright screenshot capture for Wayli.
 *
 * Logs in as the demo (screenshot) user and captures named screenshots of the
 * key pages for use in the README, docs, and the marketing site. Pairs with
 * scripts/seed-screenshots.ts.
 *
 * Prerequisites:
 *   - A running Wayli web server (default http://localhost:4000), e.g. `bun run dev`
 *   - A seeded demo user (run `bun run scripts/seed-screenshots.ts` first)
 *
 * Usage (from web/):
 *   bun run scripts/capture-screenshots.ts
 *
 * Env overrides:
 *   WAYLI_BASE_URL           (default: http://localhost:4000)
 *   WAYLI_SEED_EMAIL         (default: screenshots-demo@wayli.app)
 *   WAYLI_SEED_PASSWORD      (default: wayli-screenshots-demo!)
 *   WAYLI_SEED_USERNAME      (default: wayli-demo)
 *   WAYLI_SCREENSHOTS_DIR    (default: ../docs/images)
 *
 * Output: JPEG screenshots at quality 85, 1440x900 desktop (plus a few mobile).
 *
 * @fluxbase:none — standalone Node/Bun script, not a Fluxbase job.
 */

import { chromium, type Page, type Browser, type BrowserContext } from '@playwright/test';

// Load web/.env so an existing demo username/email/password can be overridden.
const envFile = new URL('../.env', import.meta.url);
try {
	const text = await Bun.file(envFile).text();
	for (const line of text.split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (!m) continue;
		const [, key, raw] = m;
		const val = raw.replace(/^["']|["']$/g, '');
		if (!(key in process.env)) process.env[key] = val;
	}
} catch {
	// .env optional.
}

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.WAYLI_BASE_URL || 'http://localhost:4000';
const EMAIL = process.env.WAYLI_SEED_EMAIL || 'screenshots-demo@wayli.app';
const PASSWORD = process.env.WAYLI_SEED_PASSWORD || 'wayli-screenshots-demo!';
const USERNAME = process.env.WAYLI_SEED_USERNAME || 'wayli-demo';
const OUT_DIR = process.env.WAYLI_SCREENSHOTS_DIR || '../docs/images';

const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

// The demo trips created by the seeder (ids must match seed-screenshots.ts).
const KYOTO_TRIP_ID = 'a1b2c3d4-0001-4000-8000-000000000001';

// ── Shot definitions ────────────────────────────────────────────────────────

interface Shot {
	name: string;
	path: string;
	theme?: 'light' | 'dark';
	viewport?: 'desktop' | 'mobile';
	/** Selector that must be present AND visible before capturing (page loaded). */
	readySelector?: string;
	/** Element selector to screenshot instead of full page (scoped to content). */
	elementSelector?: string;
	login?: boolean;
	/** Extra settle time for heavy pages (maps, charts). */
	settleMs?: number;
	/** Capture the full scrollable page instead of just the viewport. */
	fullPage?: boolean;
}

const shots: Shot[] = [
	// Public landing hero (logged-out) — both themes.
	{
		name: 'landing-light',
		path: '/',
		theme: 'light',
		readySelector: 'img[alt="Wayli"]',
		login: false
	},
	{
		name: 'landing-dark',
		path: '/',
		theme: 'dark',
		readySelector: 'img[alt="Wayli"]',
		login: false
	},
	// Dashboard pages (logged-in) — light theme, desktop.
	// The dashboard content area is the scoped target so the sidebar chrome
	// doesn't repeat in every shot; for the "showcase" shots we capture it.
	{
		name: 'screenshot-trips',
		path: '/dashboard/travel',
		readySelector: 'h1',
		login: true,
		settleMs: 2500
	},
	{
		// Full-page capture of the travel dashboard: the "Where I've Been" world
		// map, trip cards with covers, and the sticky overview map sidebar.
		name: 'screenshot-travel-overview',
		path: '/dashboard/travel',
		// "Where I've Been" heading only renders once visited countries load.
		readySelector: 'h3:has-text("Where I\'ve Been")',
		login: true,
		settleMs: 4000,
		fullPage: true
	},
	{
		name: 'screenshot-statistics',
		path: '/dashboard/statistics',
		readySelector: 'h1',
		login: true,
		settleMs: 4000
	},
	{
		name: 'screenshot-want-to-visit',
		path: '/dashboard/want-to-visit',
		readySelector: 'h1',
		login: true,
		settleMs: 3500
	},
	{
		name: 'screenshot-trip-plan',
		path: `/dashboard/travel/${KYOTO_TRIP_ID}/plan`,
		readySelector: 'h1',
		login: true,
		settleMs: 3000
	},
	{
		name: 'screenshot-feed',
		path: '/dashboard/feed',
		readySelector: 'h1',
		login: true,
		settleMs: 2500
	},
	{
		name: 'screenshot-import-export',
		path: '/dashboard/import-export',
		readySelector: 'h1',
		login: true,
		settleMs: 2500
	},
	{
		name: 'screenshot-account-settings',
		path: '/dashboard/account-settings',
		readySelector: 'h1',
		login: true,
		settleMs: 2500
	},
	// Public profile. Captured while authenticated (as the demo user, who is
	// the profile owner) so the trip cards, stats pills, and "Where I've Been"
	// world map populate — the local dev anon role can't SELECT trips, so a
	// logged-out capture renders an empty profile.
	{
		name: 'screenshot-public-profile',
		path: `/u/${USERNAME}`,
		readySelector: 'main',
		login: true,
		settleMs: 3500
	},
	// A couple of mobile shots for responsive docs.
	{
		name: 'screenshot-statistics-mobile',
		path: '/dashboard/statistics',
		viewport: 'mobile',
		readySelector: 'h1',
		login: true,
		settleMs: 4000
	},
	{
		name: 'screenshot-trips-mobile',
		path: '/dashboard/travel',
		viewport: 'mobile',
		readySelector: 'h1',
		login: true,
		settleMs: 3000
	}
];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
	await page.evaluate((t) => {
		localStorage.setItem('theme', t);
		document.documentElement.classList.toggle('dark', t === 'dark');
	}, theme);
}

/**
 * Pre-seed localStorage so the storage-notice banner never renders, and set the
 * locale so i18n loads deterministically. Applied to every page in the context.
 */
function installStorageDefaults(ctx: BrowserContext): void {
	ctx.addInitScript(() => {
		try {
			localStorage.setItem('wayli-storage-notice-dismissed', 'true');
			localStorage.setItem('wayli-locale', 'en');
			localStorage.setItem('wayli.ai.fab_hint_dismissed', '1');
		} catch {
			/* ignore */
		}
	});
}

async function login(page: Page): Promise<void> {
	console.log(`  → signing in as ${EMAIL} ...`);
	await page.goto(`${BASE_URL}/auth/signin`, { waitUntil: 'domcontentloaded' });

	// The signin form hydrates after domcontentloaded (it's gated on i18n /
	// auth-state checks), so wait for the email input to actually appear.
	const emailInput = page.locator('#email');
	await emailInput.waitFor({ state: 'visible', timeout: 15000 });
	const pwInput = page.locator('#password');
	await pwInput.waitFor({ state: 'visible', timeout: 15000 });

	await emailInput.fill(EMAIL);
	await pwInput.fill(PASSWORD);
	// Submit via Enter on the password field (the most reliable trigger; the
	// visible submit button can be shadowed by the password-toggle button).
	await pwInput.press('Enter');

	// Wait for navigation away from signin. This is the source of truth for a
	// successful login — don't swallow it; a silent failure here makes every
	// dashboard shot capture the signin page.
	await page.waitForURL((url) => !url.pathname.startsWith('/auth/signin'), { timeout: 20000 });
	// Let the session rehydrate + dashboard mount settle.
	await page.waitForTimeout(2000);
}

/**
 * Wait until a dashboard page is genuinely ready: i18n messages loaded (the
 * storage-notice / nav text resolves), the admin-check spinner gone, and the
 * page's readySelector visible. Throws if the page redirected to signin.
 */
async function waitForDashboardReady(page: Page, shot: Shot): Promise<void> {
	const targetPath = shot.path;

	// 1. Wait for i18n: the app fetches /messages/<locale>.json and populates a
	//    store. Until then, nav/labels show raw keys. Wait for that fetch +
	//    the AppNav sidebar link to render with resolved text.
	await page
		.waitForResponse((r) => r.url().includes('/messages/') && r.status() === 200, {
			timeout: 15000
		})
		.catch(() => {});

	// 2. Wait for the admin-check spinner to disappear (dashboard init done).
	await page
		.locator('.animate-spin')
		.first()
		.waitFor({ state: 'detached', timeout: 20000 })
		.catch(() => {});

	// 3. Guard: if we got bounced back to signin, this shot can't be captured.
	if (page.url().includes('/auth/signin')) {
		throw new Error(`redirected to signin — not authenticated for ${targetPath}`);
	}

	// 4. Wait for the page-specific ready selector.
	if (shot.readySelector) {
		await page
			.locator(shot.readySelector)
			.first()
			.waitFor({ state: 'visible', timeout: 15000 })
			.catch(() => {});
	}
}

/**
 * Hide transient overlays that shouldn't appear in a polished screenshot:
 * the onboarding checklist banner, toast notifications, and the AI FAB pulse.
 */
async function hideTransientUi(page: Page): Promise<void> {
	await page.evaluate(() => {
		// Onboarding checklist banner (the seeder completes onboarding, but hide
		// defensively in case it re-renders).
		document
			.querySelectorAll('[data-onboarding-banner], .onboarding-checklist, [role="status"]')
			.forEach((el) => ((el as HTMLElement).style.visibility = 'hidden'));
		// Toast region (svelte-sonner).
		document
			.querySelectorAll('[class*="sonner"], [data-sonner-toaster]')
			.forEach((el) => ((el as HTMLElement).style.visibility = 'hidden'));
		// Floating AI button (bottom-right) — remove the pulse so it isn't blurry.
		document.querySelectorAll('button.fixed.animate-pulse').forEach((el) => {
			(el as HTMLElement).classList.remove('animate-pulse');
		});
	});
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log('📸 Wayli screenshot capture');
	console.log(`   base URL: ${BASE_URL}`);
	console.log(`   output:   ${OUT_DIR}`);

	const browser: Browser = await chromium.launch({ headless: true });

	// Anon context (logged-out) and authed context (logged-in).
	const anonContext = await browser.newContext({
		viewport: { ...DESKTOP },
		deviceScaleFactor: 2,
		ignoreHTTPSErrors: true
	});
	const authedContext = await browser.newContext({
		viewport: { ...DESKTOP },
		deviceScaleFactor: 2,
		ignoreHTTPSErrors: true
	});
	installStorageDefaults(anonContext);
	installStorageDefaults(authedContext);

	// Pre-authenticate the authed context on a persistent "warm" desktop page.
	// Reusing this page for desktop dashboard shots avoids the session-
	// rehydration race that sends cold page loads back to /auth/signin.
	let authedOk = false;
	const warmDesktopPage = await authedContext.newPage();
	try {
		await login(warmDesktopPage);
		console.log('  ✓ authenticated');
		authedOk = true;
	} catch (err) {
		console.warn(
			'  ⚠️ login failed — logged-in shots will be skipped.\n' +
				'    Did you run `bun run scripts/seed-screenshots.ts` first?\n' +
				'    Error:',
			(err as Error)?.message
		);
	}

	let ok = 0;
	let failed = 0;
	const failures: string[] = [];
	// A second warm page for mobile-viewport dashboard shots.
	let warmMobilePage: Page | null = null;

	for (const shot of shots) {
		const theme = shot.theme ?? 'light';
		const isMobile = shot.viewport === 'mobile';
		const vp = isMobile ? MOBILE : DESKTOP;
		const out = `${OUT_DIR}/${shot.name}.jpg`;

		process.stdout.write(`  • ${shot.name} ... `);

		// Pick the page to capture on.
		let page: Page;
		try {
			if (shot.login === false) {
				// Public (logged-out) shots: fresh page in the anon context.
				page = await anonContext.newPage();
				await page.setViewportSize({ width: vp.width, height: vp.height });
				await page.goto(`${BASE_URL}${shot.path}`, {
					waitUntil: 'domcontentloaded',
					timeout: 30000
				});
				await setTheme(page, theme);
				if (shot.readySelector) {
					await page
						.locator(shot.readySelector)
						.first()
						.waitFor({ state: 'visible', timeout: 15000 })
						.catch(() => {});
				}
			} else {
				// Logged-in shots: reuse a warm authenticated page so the session
				// is already rehydrated (no redirect-to-signin race).
				if (!authedOk) throw new Error('not authenticated (login failed earlier)');
				if (isMobile) {
					if (!warmMobilePage) {
						warmMobilePage = await authedContext.newPage();
						await warmMobilePage.setViewportSize({ width: vp.width, height: vp.height });
						// Prime the session on the mobile page too.
						await warmMobilePage.goto(`${BASE_URL}/dashboard/travel`, {
							waitUntil: 'domcontentloaded',
							timeout: 30000
						});
						await warmMobilePage.waitForTimeout(3000);
					}
					page = warmMobilePage;
					await page.setViewportSize({ width: vp.width, height: vp.height });
				} else {
					page = warmDesktopPage;
				}
				await setTheme(page, theme);
				await page.goto(`${BASE_URL}${shot.path}`, {
					waitUntil: 'domcontentloaded',
					timeout: 30000
				});
				await waitForDashboardReady(page, shot);
			}

			await hideTransientUi(page);
			// Extra settle for maps/charts/clustered markers.
			await page.waitForTimeout(shot.settleMs ?? 2500);

			const target = shot.elementSelector
				? (await page.locator(shot.elementSelector).elementHandle()) ?? page
				: page;
			await (target as any).screenshot({
				path: out,
				type: 'jpeg',
				quality: 85,
				fullPage: shot.fullPage ?? false
			});
			console.log(`saved → ${out}`);
			ok++;
		} catch (err) {
			console.log(`FAILED (${(err as Error)?.message})`);
			failed++;
			failures.push(`${shot.name}: ${(err as Error)?.message}`);
		} finally {
			// Only close anon pages; keep the warm authed pages for reuse.
			if (shot.login === false && page!) {
				await page.close().catch(() => {});
			}
		}
	}

	await anonContext.close();
	await authedContext.close();
	await browser.close();

	console.log(`\n${ok} captured, ${failed} failed.`);
	if (failures.length) {
		console.log('Failures:');
		for (const f of failures) console.log(`  - ${f}`);
	}
	if (ok === 0) process.exit(1);
}

main().catch((err) => {
	console.error('\n💥 Capture failed:');
	console.error(err);
	process.exit(1);
});
