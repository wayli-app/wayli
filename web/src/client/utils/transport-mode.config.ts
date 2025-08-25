// Speed brackets for transport modes (km/h)
export const SPEED_BRACKETS = [
	{ min: 0, max: 1.000001, mode: 'stationary' },
	{ min: 1, max: 8, mode: 'walking' },
	{ min: 8, max: 25, mode: 'cycling' },
	{ min: 25, max: 80, mode: 'car' },
	{ min: 80, max: 300, mode: 'train' },
	{ min: 300, max: Infinity, mode: 'airplane' }
];
