// Speed brackets for transport modes (km/h)
export const SPEED_BRACKETS = [
	{ min: 0, max: 2, mode: 'stationary' },
	{ min: 2, max: 8, mode: 'walking' },
	{ min: 8, max: 25, mode: 'cycling' },
	{ min: 25, max: 120, mode: 'car' },
	{ min: 30, max: 300, mode: 'train' },
	{ min: 300, max: Infinity, mode: 'airplane' }
];
