// web/src/lib/services/queue/helpers/eta.ts

export function calculateEstimatedTimeRemaining(
  processed: number,
  totalPoints: number,
  processedInLastBatch: number,
  concurrency: number,
  elapsedTimeMs?: number
): string {
  if (processed === 0 || processedInLastBatch === 0) {
    return 'Calculating...';
  }

  const remainingPoints = totalPoints - processed;

  let pointsPerSecond: number;
  if (elapsedTimeMs && elapsedTimeMs > 0) {
    pointsPerSecond = (processed * 1000) / elapsedTimeMs;
  } else {
    const estimatedMsPerPoint = 200;
    pointsPerSecond = (concurrency * 1000) / estimatedMsPerPoint;
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


