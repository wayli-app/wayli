// web/src/lib/services/queue/helpers/concurrency.ts

export function delay(ms: number): Promise<void> {
	// Safety check to prevent Infinity values
	if (!isFinite(ms) || ms < 0) {
		console.warn(`⚠️ Warning: Invalid delay value ${ms}, using 0 instead`);
		ms = 0;
	}
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
