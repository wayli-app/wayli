/**
 * Playwright E2E test configuration for Wayli.
 * @see https://playwright.dev/docs/test-configuration
 */

import { defineConfig, devices } from '@playwright/test';

// On CI we fail fast on test.only and add retries; locally we don't, for speed.
const onCI = !!process.env.CI;

// Running the setup smoke against the compose stack? Then the app is already up
// via `docker compose up` (CI / scripts/verify-setup.ts), so we must NOT spawn a
// dev server, and we wire the setup global setup/teardown. Selected via:
//   playwright test --project=setup   (the test:setup script sets WAYLI_SETUP_PROJECT=1)
const SETUP_PROJECT =
	process.env.WAYLI_SETUP_PROJECT === '1' || process.argv.includes('--project=setup');

export default defineConfig({
	// Test directory
	testDir: './tests/e2e',

	// Run tests in parallel
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: onCI,

	// Retry failed tests on CI only
	retries: onCI ? 2 : 0,

	// Opt out of parallel tests on CI for stability
	workers: onCI ? 1 : undefined,

	// Reporter to use
	reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],

	// Wait for the compose stack to be healthy before the setup smoke runs, and
	// clean up the test user afterwards. Only wired when running the setup project
	// (the public-page specs boot their own dev server via webServer below).
	...(SETUP_PROJECT
		? {
				globalSetup: './tests/e2e/global-setup.ts',
				globalTeardown: './tests/e2e/global-teardown.ts'
			}
		: {}),

	// Shared settings for all the projects below
	use: {
		// Base URL for navigation actions like `await page.goto('/')`
		baseURL: process.env.WAYLI_BASE_URL || 'http://localhost:4000',

		// Collect trace when retrying the failed test
		trace: 'on-first-retry',

		// Take screenshot on failure
		screenshot: 'only-on-failure'
	},

	// Two mutually exclusive project sets, selected by SETUP_PROJECT:
	//  - setup mode (--project=setup / WAYLI_SETUP_PROJECT=1): ONLY the setup smoke,
	//    against an externally-booted compose stack (no webServer).
	//  - default mode: the public-page specs (auth/navigation/visual) against the
	//    dev server spun up by webServer below.
	// They can't coexist because they need different webServer behavior, so we build
	// the array conditionally rather than relying on --project filtering.
	projects: SETUP_PROJECT
		? [
				// ── Setup-verification smoke ────────────────────────────────────
				// Drives the documented `docker compose up` path against a real stack.
				// No webServer: the stack is brought up externally (CI / verify-setup.ts).
				{
					name: 'setup',
					testMatch: /setup\.spec\.ts/,
					use: { ...devices['Desktop Chrome'] }
				}
			]
		: [
				// ── Default: public-page specs against `bun run dev` ────────────
				// (auth / navigation / visual). Excludes the setup smoke, which has
				// its own project set above.
				{
					name: 'chromium',
					testIgnore: /setup\.spec\.ts/,
					use: { ...devices['Desktop Chrome'] }
				}
				// Add more browsers as needed:
				// {
				//   name: 'firefox',
				//   use: { ...devices['Desktop Firefox'] },
				// },
				// {
				//   name: 'webkit',
				//   use: { ...devices['Desktop Safari'] },
				// },
			],

	// Run your local dev server before starting the tests.
	// Disabled for the setup project (the compose stack serves the app instead).
	webServer: SETUP_PROJECT
		? undefined
		: {
				command: 'bun run dev',
				url: 'http://localhost:4000',
				reuseExistingServer: !onCI,
				timeout: 120 * 1000
			}
});
