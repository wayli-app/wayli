import { successResponse } from '$lib/utils/api/response';

// Global progress tracking (shared with import endpoint)
declare global {
	var importProgress: Map<string, { current: number; total: number; status: string }>;
}

if (!globalThis.importProgress) {
	globalThis.importProgress = new Map();
}

export const GET = async ({ url }) => {
	const importId = url.searchParams.get('id');
	if (!importId) {
		return successResponse({ percentage: 0, current: 0, total: 0, status: 'No import in progress' });
	}
	const progress = globalThis.importProgress?.get(importId);
	if (!progress) {
		return successResponse({ percentage: 0, current: 0, total: 0, status: 'No import in progress' });
	}
	const { current = 0, total = 0, status = '' } = progress;
	const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
	return successResponse({ percentage, current, total, status });
};