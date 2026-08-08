/**
 * Playwright globalTeardown for the setup-verification smoke.
 *
 * Cleans up the test user created during the run so `test:setup` is safe to repeat
 * against a long-lived dev stack. Belt-and-suspenders: in CI and via
 * scripts/verify-setup.ts the entire stack (volumes included) is destroyed by
 * `docker compose down -v`, so this only matters when reusing a persistent stack.
 *
 * The test user email is stashed in an env var by the spec via process.env so this
 * teardown (which runs after all tests, with no page context) can find it.
 */

import { wipeUserData } from './helpers/auth';

export default async function globalTeardown(): Promise<void> {
	const email = process.env.WAYLI_SMOKE_TEST_EMAIL;
	if (email) {
		console.log(`\n🧹 Tearing down smoke test user ${email} …`);
		await wipeUserData(email);
		console.log('  done.');
	}
}
