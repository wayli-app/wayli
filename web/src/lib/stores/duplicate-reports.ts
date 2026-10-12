import { writable } from 'svelte/store';
import { fluxbase } from '$lib/fluxbase';

/**
 * Pending duplicate-report count (#274) for the Data Editor nav badge.
 * Reports arrive from import-time detection and the data editor's
 * historical scan; refreshPendingDuplicateCount re-reads the count and is
 * called on app-shell mount and whenever a related job finishes
 * (data-import / duplicate-scan / duplicate-cleanup).
 */
export const pendingDuplicateCount = writable(0);

export async function refreshPendingDuplicateCount(): Promise<void> {
	try {
		const { count, error } = await fluxbase
			.from('duplicate_reports')
			.select('*', { count: 'exact', head: true })
			.eq('status', 'pending_review');
		if (!error) pendingDuplicateCount.set(count ?? 0);
	} catch {
		// non-critical — the badge just keeps its previous value
	}
}
