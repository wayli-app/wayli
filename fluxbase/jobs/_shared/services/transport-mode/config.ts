// /Users/bart/Dev/wayli/fluxbase/jobs/_shared/services/transport-mode/config.ts
// Mirrors web/src/lib/utils/transport-mode.config.ts. Update both together.

export const MODE_PHYSICAL_LIMITS = {
	stationary: { min: 0, max: 2 },
	walking: { min: 0, max: 12 },
	cycling: { min: 5, max: 45 },
	car: { min: 10, max: 180 },
	train: { min: 30, max: 350 },
	airplane: { min: 150, max: 1000 }
} as const;

export const SPEED_CV_THRESHOLDS = {
	TRAIN_LIKE: 0.15,
	CAR_LIKE: 0.25
} as const;

export const MODE_CONTINUITY_LIMITS = {
	stationary: { maxSpeedDiff: 3 },
	walking: { maxSpeedDiff: 5 },
	cycling: { maxSpeedDiff: 15 },
	car: { maxSpeedDiff: 50 },
	train: { maxSpeedDiff: 30 },
	airplane: { maxSpeedDiff: 1500 }
} as const;
