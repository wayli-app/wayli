// Enhanced speed brackets for transport modes (km/h)
// More realistic and non-overlapping brackets based on your constraints
export const SPEED_BRACKETS = [
	{ min: 0, max: 2, mode: 'stationary' },
	{ min: 2, max: 8, mode: 'walking' },
	{ min: 8, max: 25, mode: 'cycling' },
	{ min: 25, max: 80, mode: 'car' },        // Reduced upper limit for better distinction
	{ min: 80, max: 200, mode: 'train' },     // Overlapping range for car/train distinction
	{ min: 200, max: Infinity, mode: 'airplane' }
];

// Speed brackets for car/train overlap zone (80-120 km/h)
export const CAR_TRAIN_OVERLAP_BRACKETS = [
	{ min: 80, max: 120, mode: 'car' },       // Default to car in overlap
	{ min: 80, max: 120, mode: 'train' }      // Can be overridden by context
];
