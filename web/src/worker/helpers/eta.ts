// web/src/lib/services/queue/helpers/eta.ts

export function calculateEstimatedTimeRemaining(
	processed: number,
	totalPoints: number,
	processedInLastBatch: number,
	concurrency: number,
	elapsedTimeMs?: number
): string {
	// Show estimate earlier - only require some progress, not necessarily in last batch
	if (processed === 0) {
		return 'Calculating...';
	}

	const remainingPoints = totalPoints - processed;

	let pointsPerSecond: number;
	if (elapsedTimeMs && elapsedTimeMs > 0 && processed > 0) {
		// Use actual throughput from elapsed time
		pointsPerSecond = (processed * 1000) / elapsedTimeMs;
	} else if (processedInLastBatch > 0) {
		// If we have recent batch data but no elapsed time, use batch rate
		const estimatedMsPerPoint = 200;
		pointsPerSecond = (processedInLastBatch * 1000) / estimatedMsPerPoint;
	} else {
		// Last resort: estimate based on concurrency
		const estimatedMsPerPoint = 200;
		pointsPerSecond = (concurrency * 1000) / estimatedMsPerPoint;
	}

	// Prevent division by zero or negative rates
	if (pointsPerSecond <= 0) {
		return 'Calculating...';
	}

	const remainingSeconds = remainingPoints / pointsPerSecond;

	if (remainingSeconds < 60) {
		return `${Math.round(remainingSeconds)} seconds`;
	} else if (remainingSeconds < 3600) {
		return `${Math.round(remainingSeconds / 60)} minutes`;
	} else {
		return `${Math.round(remainingSeconds / 3600)} hours`;
	}
}
