/**
 * Suppresses specific deprecation warnings from third-party libraries
 * that we can't control, such as Leaflet using deprecated Mozilla properties
 */
export function suppressDeprecationWarnings() {
	if (typeof window === 'undefined') return;

	// Store original console.warn
	const originalWarn = console.warn;

	// Override console.warn to filter out specific deprecation warnings
	console.warn = function(...args: unknown[]) {
		const message = args[0];

		// Check if this is one of the deprecation warnings we want to suppress
		if (typeof message === 'string') {
			const isMozPressureWarning = message.includes('MouseEvent.mozPressure is deprecated');
			const isMozInputSourceWarning = message.includes('MouseEvent.mozInputSource is deprecated');

			// Suppress these specific warnings
			if (isMozPressureWarning || isMozInputSourceWarning) {
				return; // Don't log these warnings
			}
		}

		// Log all other warnings normally
		originalWarn.apply(console, args);
	};
}