/**
 * Run a Fluxbase settings read and treat a missing ("Setting not found") setting
 * as `null` instead of throwing.
 *
 * Fluxbase's `settings.get` / `settings.getUserSetting` throw when a setting row
 * doesn't exist — e.g. a fresh-install app setting before its migration seeds it,
 * or a per-user setting the user hasn't configured yet. Most call sites want a
 * default in that case, not a thrown error.
 *
 * Only "not found" is swallowed; all other errors propagate.
 *
 * @example
 *   const setup = await readSetting(() => fluxbase.settings.get('wayli.is_setup_complete'));
 *   // setup === null when the setting doesn't exist yet
 */
export async function readSetting<T>(read: () => Promise<T | null | undefined>): Promise<T | null> {
	try {
		return (await read()) ?? null;
	} catch (err) {
		if (err instanceof Error && /not found/i.test(err.message)) {
			return null;
		}
		throw err;
	}
}
