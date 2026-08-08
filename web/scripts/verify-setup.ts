/**
 * Local on-demand runner for the setup-verification smoke.
 *
 * Mirrors the screenshot automation's one-command UX (compare `bun run screenshots`):
 * instead of seed → capture, it does bring-up stack → verify → tear down.
 *
 *   1. Build the prod web image from the current source (tagged wayli-smoke:local).
 *   2. Generate secrets non-interactively (generate-keys.sh --stdout).
 *   3. Bring the stack up on an isolated project/network (wayli-smoke) with --wait.
 *   4. Run Playwright's setup smoke against the running stack.
 *   5. ALWAYS tear down: `docker compose down -v --remove-orphans`.
 *
 * The stack is fully ephemeral — isolated network, destroyed volumes — so it's safe
 * to run repeatedly without touching your devcontainer or any other stack.
 *
 * Usage (from web/):
 *   bun run verify:setup
 *
 * Env overrides:
 *   WAYLI_SMOKE_KEEP_STACK=1   Keep the stack up after the run (for debugging).
 *   WAYLI_SMOKE_NO_BUILD=1     Skip the image build (reuse an existing wayli-smoke:local).
 *
 * @fluxbase:none — standalone orchestration script, not a Fluxbase job.
 */

import { $, file, write } from 'bun';

// ── Config ──────────────────────────────────────────────────────────────────

const REPO_ROOT = new URL('../../', import.meta.url).pathname;
const DEPLOY_DIR = `${REPO_ROOT}deploy/docker-compose`;
const COMPOSE_BASE = `${DEPLOY_DIR}/docker-compose.yml`;
const COMPOSE_SMOKE = `${DEPLOY_DIR}/docker-compose.smoke.yml`;
const IMAGE_TAG = 'wayli-smoke:local';
const ENV_FILE = `${DEPLOY_DIR}/.smoke.env`;

const KEEP_STACK = process.env.WAYLI_SMOKE_KEEP_STACK === '1';
const SKIP_BUILD = process.env.WAYLI_SMOKE_NO_BUILD === '1';

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string): void {
	console.log(msg);
}

async function run(cmd: string[]): Promise<number> {
	// Stream output so the operator sees build/up progress in real time.
	const proc = Bun.spawn({
		cmd,
		cwd: REPO_ROOT,
		stdout: 'inherit',
		stderr: 'inherit'
	});
	return await proc.exited;
}

/** Parse KEY=VALUE lines out of the generated env file (no shell eval). */
async function readEnv(path: string): Promise<Record<string, string>> {
	const out: Record<string, string> = {};
	try {
		const text = await file(path).text();
		for (const line of text.split('\n')) {
			const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
			if (!m) continue;
			const [, key, raw] = m;
			out[key] = raw.replace(/^["']|["']$/g, '');
		}
	} catch {
		// ignore — callers handle missing keys
	}
	return out;
}

// ── Steps ───────────────────────────────────────────────────────────────────

async function buildImage(): Promise<void> {
	if (SKIP_BUILD) {
		log(`📦 Skipping build (WAYLI_SMOKE_NO_BUILD=1); reusing ${IMAGE_TAG}.`);
		return;
	}
	log(`📦 Building prod web image → ${IMAGE_TAG} …`);
	const code = await run([
		'docker',
		'build',
		'-t',
		IMAGE_TAG,
		'-f',
		`${REPO_ROOT}Dockerfile`,
		REPO_ROOT
	]);
	if (code !== 0) throw new Error(`docker build failed (exit ${code})`);
}

async function generateEnv(): Promise<Record<string, string>> {
	log('🔑 Generating secrets (generate-keys.sh --stdout) …');
	const proc = Bun.spawn(['bash', `${DEPLOY_DIR}/generate-keys.sh`, '--stdout'], {
		cwd: DEPLOY_DIR,
		stdout: 'pipe',
		stderr: 'inherit'
	});
	const text = await new Response(proc.stdout).text();
	const code = await proc.exited;
	if (code !== 0) throw new Error(`generate-keys.sh failed (exit ${code})`);
	await write(ENV_FILE, text);
	const env = await readEnv(ENV_FILE);
	if (!env.FLUXBASE_ANON_KEY || !env.FLUXBASE_SERVICE_ROLE_KEY) {
		throw new Error(
			'generate-keys.sh did not emit JWT keys (needs Docker to run the node:20 token generator). ' +
				'Ensure Docker is running and retry.'
		);
	}
	return env;
}

async function upStack(): Promise<void> {
	log('🭳 Bringing up smoke stack (docker compose up -d --wait) …');
	const code = await run([
		'docker',
		'compose',
		'-f',
		COMPOSE_BASE,
		'-f',
		COMPOSE_SMOKE,
		'--env-file',
		ENV_FILE,
		'up',
		'-d',
		'--wait'
	]);
	if (code !== 0) throw new Error(`docker compose up failed (exit ${code}). Check logs above.`);
}

async function downStack(): Promise<void> {
	if (KEEP_STACK) {
		log('🟡 Keeping stack up (WAYLI_SMOKE_KEEP_STACK=1). Remember to tear it down:');
		log(
			`   docker compose -f ${COMPOSE_BASE} -f ${COMPOSE_SMOKE} --env-file ${ENV_FILE} down -v --remove-orphans`
		);
		return;
	}
	log('🧹 Tearing down smoke stack (down -v --remove-orphans) …');
	await run([
		'docker',
		'compose',
		'-f',
		COMPOSE_BASE,
		'-f',
		COMPOSE_SMOKE,
		'--env-file',
		ENV_FILE,
		'down',
		'-v',
		'--remove-orphans'
	]);
}

async function runTests(env: Record<string, string>): Promise<number> {
	log('🧪 Running setup-verification smoke …');
	// Point the app + helpers at the running stack. The Fluxbase URL is the
	// host-side port (compose maps 8080:8080).
	const testEnv: Record<string, string> = {
		...process.env,
		WAYLI_SETUP_PROJECT: '1',
		WAYLI_BASE_URL: 'http://localhost:4000',
		FLUXBASE_PUBLIC_BASE_URL: 'http://localhost:8080',
		FLUXBASE_ANON_KEY: env.FLUXBASE_ANON_KEY,
		PUBLIC_FLUXBASE_ANON_KEY: env.FLUXBASE_ANON_KEY,
		FLUXBASE_SERVICE_ROLE_KEY: env.FLUXBASE_SERVICE_ROLE_KEY
	};
	const proc = Bun.spawn(['bun', 'run', 'test:setup'], {
		cwd: `${REPO_ROOT}web`,
		env: testEnv,
		stdout: 'inherit',
		stderr: 'inherit'
	});
	return await proc.exited;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	log('🚀 Wayli setup-verification smoke\n');

	const env = await generateEnv();
	await buildImage();
	await upStack();

	let exit = 0;
	try {
		exit = await runTests(env);
		if (exit === 0) log('\n✅ Setup smoke PASSED — the documented path works.');
		else log('\n❌ Setup smoke FAILED — see the Playwright report above.');
	} finally {
		await downStack();
	}
	process.exit(exit);
}

main().catch((err) => {
	console.error('\n💥 verify-setup failed:');
	console.error(err);
	// Best-effort cleanup even on unexpected failure.
	downStack().finally(() => process.exit(1));
});
