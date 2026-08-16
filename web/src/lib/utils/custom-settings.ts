/**
 * Read a value from a custom-settings map.
 *
 * The bulk prefix fetch (`admin.settings.app.getSettings([], { prefix })`)
 * returns a raw `{ [key]: value }` map — the server unwraps the stored
 * `{ value: ... }` object. Some older code paths returned the wrapped shape
 * (and one legacy variant nested it under `data`), so tolerate all three.
 */
export function customValue<T = unknown>(
	custom: Record<string, unknown> | null | undefined,
	key: string,
	fallback?: T
): T | undefined {
	const entry = custom?.[key];
	if (entry === undefined || entry === null) {
		return fallback;
	}
	if (typeof entry !== 'object') {
		return entry as T;
	}
	const wrapped = entry as { value?: unknown; data?: { value?: unknown } };
	const inner =
		wrapped.value !== undefined && wrapped.value !== null ? wrapped.value : wrapped.data?.value;
	return inner === undefined || inner === null ? fallback : (inner as T);
}
