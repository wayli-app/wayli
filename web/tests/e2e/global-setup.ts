/**
 * Playwright globalSetup for the setup-verification smoke.
 *
 * The app is brought up by `docker compose up` (in CI / scripts/verify-setup.ts),
 * NOT by Playwright's webServer. So globalSetup's only job is to wait until the
 * stack is actually serving before the specs run — otherwise the first navigation
 * races the container healthchecks and flakes.
 *
 * Polls both the web app (/health via nginx) and Fluxbase (/health). Throws after
 * a timeout if either never comes up, which is the clearest signal that the
 * documented `docker compose up` path is broken.
 */

import { baseUrl } from './helpers/auth';

/* oxlint-disable no-await-in-loop -- health polling is inherently sequential: each
   iteration waits on a fetch + backoff before retrying. Parallelizing makes no sense. */

const WEB_HEALTH = `${baseUrl()}/health`;
const FLUXBASE_HEALTH =
	(process.env.FLUXBASE_PUBLIC_BASE_URL || 'http://127.0.0.1:8080').replace(
		'://fluxbase:',
		'://127.0.0.1:'
	) + '/health';

const TIMEOUT_MS = Number(process.env.SMOKE_BOOT_TIMEOUT_MS || 180_000); // startup.sh sync can take a while
const POLL_MS = 3000;

async function waitHealthy(name: string, url: string): Promise<void> {
	const deadline = Date.now() + TIMEOUT_MS;
	let lastErr = '';
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(POLL_MS) });
			if (res.ok) {
				console.log(`✓ ${name} healthy (${url})`);
				return;
			}
			lastErr = `HTTP ${res.status}`;
		} catch (err) {
			lastErr = (err as Error)?.message ?? String(err);
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	throw new Error(
		`${name} did not become healthy within ${TIMEOUT_MS / 1000}s (last: ${lastErr}). ` +
			`The documented 'docker compose up' path may be broken — check the stack logs.`
	);
}

export default async function globalSetup(): Promise<void> {
	console.log('\n🭳 Waiting for smoke stack to be healthy…');
	// Fluxbase first: the web app's startup.sh sync (and the app itself) depends on it.
	await waitHealthy('Fluxbase', FLUXBASE_HEALTH);
	await waitHealthy('Wayli web', WEB_HEALTH);
	console.log('  stack ready.\n');
}
