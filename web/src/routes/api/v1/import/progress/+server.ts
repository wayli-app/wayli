import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Global progress tracking (shared with import endpoint)
declare global {
	var importProgress: Map<string, { current: number; total: number; status: string }>;
}

if (!globalThis.importProgress) {
	globalThis.importProgress = new Map();
}

export const GET: RequestHandler = async ({ url }) => {
	const importId = url.searchParams.get('id');

	if (!importId) {
		return json({ error: 'No import ID provided' }, { status: 400 });
	}

	const progress = globalThis.importProgress.get(importId);

	if (!progress) {
		return json({ error: 'Import not found' }, { status: 404 });
	}

	return json({
		current: progress.current,
		total: progress.total,
		status: progress.status,
		percentage: progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
	});
};