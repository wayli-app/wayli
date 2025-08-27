import { TransportDetectionReason } from '../_shared/transport-detection-reasons.ts';
import {
	setupRequest,
	authenticateRequest,
	successResponse,
	errorResponse,
	logError
} from '../_shared/utils.ts';

// Transport detection reasons enum is now imported from shared module

// 1. Define TrackerDataPoint interface
interface TrackerDataPoint {
	country_code?: string;
	distance?: number;
	recorded_at: string;
	geocode?: Record<string, unknown>;
	location?: { coordinates: [number, number] };
	speed?: number;
	time_spent?: number;
	transport_mode?: string;
	[key: string]: unknown;
}

Deno.serve(async (req) => {
	// Handle CORS
	const corsResponse = setupRequest(req);
	if (corsResponse) return corsResponse;

	try {
		const { supabase } = await authenticateRequest(req);

		// Parse query parameters
		const url = new URL(req.url);
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');
		const limit = parseInt(url.searchParams.get('limit') || '1000');
		const offset = parseInt(url.searchParams.get('offset') || '0');
		const includeStatistics = url.searchParams.get('include_statistics') === 'true';

		// Build base query with date filters
		let baseQuery = supabase
			.from('tracker_data')
			.select('*')
			.order('recorded_at', { ascending: false });

		// Apply date filters according to requirements:
		// - If startDate provided: get data from startDate onwards
		// - If endDate provided: get data up to endDate
		// - If neither provided: get all data
		if (startDate) {
			baseQuery = baseQuery.gte('recorded_at', startDate);
		}
		if (endDate) {
			baseQuery = baseQuery.lte('recorded_at', endDate + ' 23:59:59');
		}

		// Get total count with date filters applied
		let count = 0;
		try {
			const { count: totalCount, error: countError } = await baseQuery.select('*', {
				count: 'exact',
				head: true
			});

			if (countError) {
				logError(countError, 'TRACKER-DATA-WITH-MODE');
				// Don't fail the entire request, just set count to 0
				count = 0;
			} else {
				count = totalCount || 0;
			}
		} catch (error) {
			logError(error, 'TRACKER-DATA-WITH-MODE');
			// Don't fail the entire request, just set count to 0
			count = 0;
		}

		// Implement proper pagination with date filters
		const PAGE_SIZE = 1000;
		const MAX_PAGES = Math.ceil(limit / PAGE_SIZE);
		let allData: TrackerDataPoint[] = [];
		let pagesFetched = 0;
		let lastRecordedAt: string | null = null;

		while (pagesFetched < MAX_PAGES && allData.length < limit) {
			// Build query for current page with date filters
			let query = supabase
				.from('tracker_data')
				.select('*')
				.order('recorded_at', { ascending: false })
				.limit(PAGE_SIZE);

			// Apply the same date filters to each page query
			if (startDate) {
				query = query.gte('recorded_at', startDate);
			}
			if (endDate) {
				query = query.lte('recorded_at', endDate + ' 23:59:59');
			}

			// Apply cursor-based pagination for subsequent pages
			if (lastRecordedAt) {
				query = query.lt('recorded_at', lastRecordedAt);
			} else if (offset > 0) {
				// For the first page, skip the initial offset
				query = query.range(offset, offset + PAGE_SIZE - 1);
			}

			const { data: pageData, error: pageError } = await query;

			if (pageError) {
				logError(pageError, 'TRACKER-DATA-WITH-MODE');
				return errorResponse('Failed to fetch page data', 400);
			}

			if (!pageData || pageData.length === 0) {
				break; // No more data
			}

			// Update cursor for next page
			lastRecordedAt = pageData[pageData.length - 1].recorded_at;

			allData = [...allData, ...pageData];
			pagesFetched++;

			// Stop if we've reached the requested limit
			if (allData.length >= limit) {
				break;
			}
		}

		// Trim to exact limit if we fetched more than requested
		if (allData.length > limit) {
			allData = allData.slice(0, limit);
		}

		// Final validation: ensure all data respects the date filters
		if (startDate || endDate) {
			allData = allData.filter((point) => {
				const recordedAt = new Date(point.recorded_at);
				const startDateObj = startDate ? new Date(startDate) : null;
				const endDateObj = endDate ? new Date(endDate + ' 23:59:59') : null;

				if (startDateObj && recordedAt < startDateObj) return false;
				if (endDateObj && recordedAt > endDateObj) return false;
				return true;
			});
		}

		// Process the data with transport mode detection
		const { enhancedData, debug } = processTrackerDataWithTransportMode(allData, count);

		// Calculate statistics if requested
		let statistics = null;
		if (includeStatistics) {
			statistics = calculateStatistics(enhancedData);
		}

		return successResponse({
			locations: enhancedData,
			total: count || 0,
			hasMore: count ? offset + limit < count : false,
			debug: {
				...debug,
				pagesFetched,
				requestedLimit: limit,
				actualFetched: allData.length,
				dateFilters: {
					startDate: startDate || 'none',
					endDate: endDate || 'none',
					dateRangeApplied: startDate || endDate ? true : false,
					actualDataRange:
						allData.length > 0
							? {
									earliest: allData[allData.length - 1]?.recorded_at,
									latest: allData[0]?.recorded_at
								}
							: null
				}
			},
			statistics
		});
	} catch (error) {
		logError(error, 'TRACKER-DATA-WITH-MODE');
		return errorResponse('Internal server error', 500);
	}
});

// Process tracker data with transport mode detection
function processTrackerDataWithTransportMode(
	trackerData: TrackerDataPoint[],
	count: number
): {
	enhancedData: TrackerDataPoint[];
	debug: any;
} {
	if (trackerData.length === 0) return { enhancedData: [], debug: {} };

	// Ensure data is sorted oldest to newest for velocity calculation
	const sortedTrackerData = trackerData
		.slice()
		.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

	// Debug counters
	let missingCoords = 0,
		zeroTimeDiff = 0;
	// Prepare arrays for retroactive plane marking
	const pointModes: Array<{ mode: string; reason: string }> = [];
	const speeds: number[] = [];

	// First pass: calculate speeds and initial mode detection for segments (prev -> curr)
	for (let i = 1; i < sortedTrackerData.length; i++) {
		const prev = sortedTrackerData[i - 1];
		const curr = sortedTrackerData[i];
		let detectionReason = TransportDetectionReason.DEFAULT;
		let mode = 'unknown';

		// Calculate speed using DB-provided speed (m/s) when available; fallback to DB distance/time; last resort: geometric calc
		let speedKmh = 0;
		if (typeof curr.speed === 'number' && isFinite(curr.speed) && curr.speed >= 0) {
			speedKmh = curr.speed * 3.6;
		} else if (
			typeof curr.distance === 'number' &&
			isFinite(curr.distance) &&
			typeof curr.time_spent === 'number' &&
			isFinite(curr.time_spent) &&
			curr.time_spent > 0
		) {
			speedKmh = (curr.distance / curr.time_spent) * 3.6;
		} else if (prev.location && curr.location) {
			const distance = haversineDistance(
				prev.location.coordinates[1],
				prev.location.coordinates[0],
				curr.location.coordinates[1],
				curr.location.coordinates[0]
			);
			const timeDiff = new Date(curr.recorded_at).getTime() - new Date(prev.recorded_at).getTime();
			if (timeDiff > 0) {
				speedKmh = (distance / (timeDiff / 1000)) * 3.6;
			} else {
				zeroTimeDiff++;
			}
		} else {
			missingCoords++;
		}
		speeds[i] = speedKmh;

		// Enhanced transport mode detection - prioritizing reliable indicators over speed
		if (
			curr.geocode &&
			(curr.geocode.class === 'aeroway' || curr.geocode.type === 'aerodrome') &&
			speedKmh > 100
		) {
			// Aeroway or aerodrome detected with high speed - assume airplane
			mode = 'airplane';
			detectionReason = TransportDetectionReason.AIRPORT_AND_PLANE_SPEED;
		} else if (
			curr.geocode &&
			(curr.geocode.type === 'railway_station' || curr.geocode.class === 'railway')
		) {
			// Train station detected - primary indicator
			mode = 'train';
			detectionReason = TransportDetectionReason.TRAIN_STATION_AND_SPEED;
		} else if (curr.geocode && curr.geocode.amenity === 'airport') {
			// Airport detected - primary indicator
			mode = 'airplane';
			detectionReason = TransportDetectionReason.AIRPORT_AND_PLANE_SPEED;
			// } else if (curr.geocode && (curr.geocode.type === 'motorway' && curr.geocode.class === 'highway')) {
			//   // Highway/motorway detected - primary indicator
			//   mode = 'car'
			//   detectionReason = TransportDetectionReason.HIGHWAY_OR_MOTORWAY
		} else if (curr.geocode && curr.geocode.amenity === 'bus_station') {
			// Bus station detected - primary indicator
			mode = 'car'; // Treat as car for now, could be 'bus' if we add that mode
			detectionReason = TransportDetectionReason.HIGHWAY_OR_MOTORWAY;
		} else if (curr.geocode && curr.geocode.amenity === 'subway_entrance') {
			// Subway detected - primary indicator
			mode = 'train';
			detectionReason = TransportDetectionReason.TRAIN_STATION_AND_SPEED;
		} else if (curr.geocode && curr.geocode.amenity === 'ferry_terminal') {
			// Ferry terminal detected - primary indicator
			mode = 'car'; // Could be 'ferry' if we add that mode
			detectionReason = TransportDetectionReason.HIGHWAY_OR_MOTORWAY;
		} else if (curr.geocode && curr.geocode.landuse === 'railway') {
			// Railway landuse detected - primary indicator
			mode = 'train';
			detectionReason = TransportDetectionReason.TRAIN_STATION_AND_SPEED;
		} else if (curr.geocode && curr.geocode.landuse === 'industrial') {
			// Industrial area - likely car
			mode = 'car';
			detectionReason = TransportDetectionReason.CAR_SPEED_ONLY;
		} else if (curr.geocode && curr.geocode.landuse === 'residential') {
			// Residential area - likely walking, car, or stationary based on speed
			if (speedKmh > 30) {
				mode = 'car';
				detectionReason = TransportDetectionReason.CAR_SPEED_ONLY;
			} else if (speedKmh > 1) {
				mode = 'walking';
				detectionReason = TransportDetectionReason.WALKING_SPEED_ONLY;
			} else {
				mode = 'stationary';
				detectionReason = TransportDetectionReason.STATIONARY_SPEED_ONLY;
			}
		} else if (curr.geocode && curr.geocode.landuse === 'park') {
			// Park - likely walking, cycling, or stationary
			if (speedKmh > 15) {
				mode = 'cycling';
				detectionReason = TransportDetectionReason.CYCLING_SPEED_ONLY;
			} else if (speedKmh > 1) {
				mode = 'walking';
				detectionReason = TransportDetectionReason.WALKING_SPEED_ONLY;
			} else {
				mode = 'stationary';
				detectionReason = TransportDetectionReason.STATIONARY_SPEED_ONLY;
			}
		} else if (curr.geocode && curr.geocode.type === 'golf_course') {
			// Golf course detected - assume walking if mode is unknown
			mode = 'walking';
			detectionReason = TransportDetectionReason.GOLF_COURSE_WALKING;
		} else {
			// Fallback to speed-based detection (least preferred)
			if (speedKmh > 400) {
				mode = 'airplane';
				detectionReason = TransportDetectionReason.HIGH_VELOCITY_PLANE;
			} else if (speedKmh > 350) {
				mode = 'airplane';
				detectionReason = TransportDetectionReason.PLANE_SPEED_ONLY;
			} else if (speedKmh > 150) {
				mode = 'train';
				detectionReason = TransportDetectionReason.TRAIN_SPEED_ONLY;
			} else if (speedKmh > 80) {
				mode = 'car';
				detectionReason = TransportDetectionReason.CAR_SPEED_ONLY;
			} else if (speedKmh > 30) {
				mode = 'car';
				detectionReason = TransportDetectionReason.CAR_SPEED_ONLY;
			} else if (speedKmh > 15) {
				mode = 'cycling';
				detectionReason = TransportDetectionReason.CYCLING_SPEED_ONLY;
			} else {
				// New walking logic: only if speed, distance, and time are all realistic
				if (
					speedKmh >= 2 &&
					speedKmh <= 6 &&
					typeof distance === 'number' &&
					distance < 2000 &&
					typeof timeDiff === 'number' &&
					timeDiff < 30 * 60 * 1000
				) {
					mode = 'walking';
					detectionReason = TransportDetectionReason.WALKING_SPEED_ONLY;
				} else if (speedKmh >= 2 && speedKmh <= 6) {
					// If speed is in walking range but other conditions aren't met, still classify as walking
					mode = 'walking';
					detectionReason = TransportDetectionReason.WALKING_SPEED_ONLY;
				} else if (speedKmh > 0 && speedKmh < 2) {
					// Only mark as stationary if speed is very low (below 2 km/h)
					mode = 'stationary';
					detectionReason = TransportDetectionReason.STATIONARY_SPEED_ONLY;
				} else {
					mode = 'unknown';
					detectionReason = TransportDetectionReason.DEFAULT;
				}
			}
		}

		pointModes[i] = { mode, reason: detectionReason };
	}

	// Second pass: Apply enhanced continuity detection and train station logic
	for (let i = 1; i < pointModes.length; i++) {
		const prevMode = pointModes[i - 1]?.mode || 'unknown';
		const currMode = pointModes[i]?.mode || 'unknown';
		const speedKmh = speeds[i];

		// Enhanced continuity detection with speed-based logic
		const isContinuityBroken =
			(prevMode === 'airplane' && currMode === 'car') ||
			(prevMode === 'car' && currMode === 'airplane') ||
			(prevMode === 'airplane' && currMode === 'walking') ||
			(prevMode === 'walking' && currMode === 'airplane') ||
			(prevMode === 'airplane' && currMode === 'cycling') ||
			(prevMode === 'cycling' && currMode === 'airplane') ||
			(prevMode === 'train' && currMode === 'car' && speedKmh > 80) || // Can't switch from train to car at high speed
			(prevMode === 'car' && currMode === 'train' && speedKmh > 80) || // Can't switch from car to train at high speed
			(prevMode === 'cycling' && currMode === 'train') || // Can't switch from cycling to train
			(prevMode === 'train' && currMode === 'cycling'); // Can't switch from train to cycling

		// Walking-unknown continuity: if user was walking and now unknown, assume still walking
		const walkingUnknownContinuity =
			(prevMode === 'walking' && currMode === 'unknown') ||
			(prevMode === 'unknown' && currMode === 'walking');

		// Speed-based continuity: if speed is similar, maintain mode
		const speedSimilar = Math.abs(speedKmh - speeds[i - 1]) < 30; // Within 30 km/h
		const highSpeedContinuity = speedKmh > 80 && speeds[i - 1] > 80 && speedSimilar;

		if (isContinuityBroken) {
			// Keep the previous mode for continuity
			pointModes[i].mode = prevMode;
			pointModes[i].reason = TransportDetectionReason.KEEP_CONTINUITY;
		} else if (walkingUnknownContinuity) {
			// If switching between walking and unknown, assume still walking
			pointModes[i].mode = 'walking';
			pointModes[i].reason = TransportDetectionReason.KEEP_CONTINUITY;
		} else if (highSpeedContinuity && prevMode !== 'unknown') {
			// Maintain high-speed mode if speeds are similar
			pointModes[i].mode = prevMode;
			pointModes[i].reason = TransportDetectionReason.KEEP_CONTINUITY;
		} else if (currMode === 'unknown' && prevMode !== 'unknown') {
			// If current mode is unknown but previous was known, try to maintain continuity
			pointModes[i].mode = prevMode;
			pointModes[i].reason = TransportDetectionReason.KEEP_CONTINUITY;
		}
	}

	// Third pass: Train station detection and retroactive marking
	const trainStations: Array<{ index: number; point: TrackerDataPoint }> = [];
	for (let i = 0; i < sortedTrackerData.length; i++) {
		const point = sortedTrackerData[i];
		if (point.geocode && point.geocode.amenity === 'train_station') {
			trainStations.push({ index: i, point });
		}
	}

	// If we have train stations, mark segments between them as train if speed is appropriate
	for (let i = 0; i < trainStations.length - 1; i++) {
		const startStation = trainStations[i];
		const endStation = trainStations[i + 1];
		const startIndex = startStation.index;
		const endIndex = endStation.index;

		// Check if the journey between stations has appropriate train speed
		let hasTrainSpeed = false;
		let avgSpeed = 0;
		let speedCount = 0;

		for (let j = startIndex + 1; j < endIndex; j++) {
			if (speeds[j] > 0) {
				avgSpeed += speeds[j];
				speedCount++;
				if (speeds[j] > 50 && speeds[j] < 200) {
					// Train speed range
					hasTrainSpeed = true;
				}
			}
		}

		if (speedCount > 0) {
			avgSpeed = avgSpeed / speedCount;
		}

		// If we have train-like speeds between stations, mark as train
		if (hasTrainSpeed && avgSpeed > 60) {
			for (let j = startIndex + 1; j < endIndex; j++) {
				if (speeds[j] > 30) {
					// Only mark if moving
					pointModes[j].mode = 'train';
					pointModes[j].reason = TransportDetectionReason.TRAIN_STATION_AND_SPEED;
				}
			}
		}
	}

	// Retroactive plane marking (for segments)
	for (let i = 1; i < pointModes.length; i++) {
		if (pointModes[i].mode === 'airplane' && speeds[i] > 400) {
			// Mark contiguous > 100 km/h as plane
			// Backward
			let j = i - 1;
			while (j > 0 && speeds[j] > 100) {
				pointModes[j].mode = 'airplane';
				pointModes[j].reason = TransportDetectionReason.HIGH_VELOCITY_PLANE;
				j--;
			}
			// Forward
			j = i + 1;
			while (j < pointModes.length && speeds[j] > 100) {
				pointModes[j].mode = 'airplane';
				pointModes[j].reason = TransportDetectionReason.HIGH_VELOCITY_PLANE;
				j++;
			}
		}
	}

	// Fourth pass: fill unknown modes by assuming last known mode
	let lastKnownMode: string = 'unknown';
	for (let i = 0; i < pointModes.length; i++) {
		const current = pointModes[i];
		const currentMode = current?.mode || 'unknown';
		if (currentMode !== 'unknown') {
			lastKnownMode = currentMode;
		} else if (lastKnownMode !== 'unknown') {
			pointModes[i] = {
				mode: lastKnownMode,
				reason: TransportDetectionReason.KEEP_CONTINUITY
			};
		}
	}

	// Second pass: assign segment data to each point (ending at that point)
	const enhancedData = sortedTrackerData.map(
		(point: TrackerDataPoint, i: number, arr: TrackerDataPoint[]) => {
			if (i === 0) {
				return {
					...point,
					velocity: null,
					distance_from_prev: null,
					transport_mode: 'unknown',
					detectionReason: null
				};
			}

			// Calculate velocity (km/h) and distance from previous point, preferring DB values
			let velocity: number | null = null;
			let distance_from_prev = 0;
			const prev = arr[i - 1];
			const transportMode = pointModes[i]?.mode || 'unknown';
			const detectionReason = pointModes[i]?.reason || TransportDetectionReason.DEFAULT;

			const hasDbDistance = typeof point.distance === 'number' && isFinite(point.distance);
			const hasDbSpeed = typeof point.speed === 'number' && isFinite(point.speed);
			const hasDbTime =
				typeof point.time_spent === 'number' && isFinite(point.time_spent) && point.time_spent > 0;

			if (hasDbDistance) {
				distance_from_prev = point.distance;
			} else if (prev.location && point.location) {
				distance_from_prev = haversineDistance(
					prev.location.coordinates[1],
					prev.location.coordinates[0],
					point.location.coordinates[1],
					point.location.coordinates[0]
				);
			}

			if (hasDbSpeed) {
				velocity = Math.round(point.speed * 3.6 * 100) / 100;
			} else if (hasDbDistance && hasDbTime) {
				velocity = Math.round((point.distance / point.time_spent) * 3.6 * 100) / 100;
			} else if (prev.location && point.location) {
				const d = distance_from_prev;
				const t = new Date(point.recorded_at).getTime() - new Date(prev.recorded_at).getTime();
				if (t > 0) {
					velocity = (d / t) * 3.6 * 1000; // m/ms to km/h
				} else {
					velocity = null;
				}
			} else {
				velocity = null;
			}

			return {
				...point,
				velocity,
				distance_from_prev,
				transport_mode: transportMode,
				detectionReason
			};
		}
	);

	return { enhancedData, debug: { total: count, missingCoords, zeroTimeDiff } };
}

// Velocity estimation function removed - we only calculate actual velocity from time differences

// Calculate comprehensive statistics from tracker data
function calculateStatistics(trackerData: TrackerDataPoint[]): any {
	if (trackerData.length === 0) {
		return {
			totalDistance: '0 km',
			earthCircumferences: 0,
			locationsVisited: '0',
			timeSpent: '0 days',
			geopoints: 0,
			steps: 0,
			uniquePlaces: 0,
			countriesVisited: 0,
			activity: [],
			transport: [],
			countryTimeDistribution: [],
			visitedPlaces: 0,
			timeSpentMoving: '0h',
			trainStationVisits: []
		};
	}

	// Initialize variables (distance in meters, time in milliseconds)
	let totalDistance = 0;
	let timeSpentMoving = 0;
	const geopoints = trackerData.length;
	const uniqueCountries = new Set<string>();
	const uniquePlaces = new Set<string>();
	const transportModes: Record<string, { distance: number; time: number; points: number }> = {};
	const activityData: Array<{ label: string; distance: number; locations: number }> = [];
	const trainStationVisits: { name: string; count: number }[] = [];
	const stationVisits = new Map<string, number[]>();
	const byCountry: Record<string, Date[]> = {};

	// Process each tracker point
	for (let i = 0; i < trackerData.length; i++) {
		const point = trackerData[i];
		const nextPoint = trackerData[i + 1];

		// Prefer server-calculated columns: distance (meters) and time_spent (seconds)
		const dbDistance =
			typeof point.distance === 'number' && isFinite(point.distance) ? point.distance : 0;
		const dbTimeMs =
			typeof point.time_spent === 'number' && isFinite(point.time_spent)
				? point.time_spent * 1000
				: 0;

		let distance = dbDistance;
		let timeDiff = dbTimeMs;

		// Fallback to geometric calc when DB columns aren't present
		if (distance === 0 || timeDiff === 0) {
			if (nextPoint && point.location && nextPoint.location) {
				const geomDist = haversineDistance(
					point.location.coordinates[1],
					point.location.coordinates[0],
					nextPoint.location.coordinates[1],
					nextPoint.location.coordinates[0]
				);
				if (distance === 0) distance = geomDist;
				if (timeDiff === 0) {
					const td =
						new Date(nextPoint.recorded_at).getTime() - new Date(point.recorded_at).getTime();
					if (td > 0 && td < 3600000) timeDiff = td;
				}
			}
		}

		// Use transport mode from enhanced data
		const mode = point.transport_mode || 'unknown';

		// Only count moving time and distance for non-stationary segments
		if (mode !== 'stationary') {
			timeSpentMoving += timeDiff;
			// Only accumulate distance for non-stationary modes
			totalDistance += distance;
		}

		if (!transportModes[mode]) {
			transportModes[mode] = { distance: 0, time: 0, points: 0 };
		}
		transportModes[mode].distance += distance;
		transportModes[mode].time += timeDiff;
		transportModes[mode].points += 1;

		// Track countries and places
		if (point.country_code) {
			uniqueCountries.add(point.country_code);
			if (!byCountry[point.country_code]) {
				byCountry[point.country_code] = [];
			}
			byCountry[point.country_code].push(new Date(point.recorded_at));
		}

		// Skip geocode processing if it's an error
		if (point.geocode && typeof point.geocode === 'object' && 'error' in point.geocode) {
			continue;
		}

		// Only add city/village to visited places if user spent more than an hour there
		if (point.geocode?.address?.city || point.geocode?.address?.village) {
			const cityName = point.geocode.address.city || point.geocode.address.village;

			// Check if we have enough data points in this city to determine time spent
			const cityPoints = trackerData.filter(
				(p) => p.geocode?.address?.city === cityName || p.geocode?.address?.village === cityName
			);

			if (cityPoints.length > 1) {
				// Calculate total time spent in this city
				let totalTimeInCity = 0;
				for (let j = 0; j < cityPoints.length - 1; j++) {
					const currentPoint = cityPoints[j];
					const nextPoint = cityPoints[j + 1];

					// Only count time if next point is also in the same city
					if (
						nextPoint.geocode?.address?.city === cityName ||
						nextPoint.geocode?.address?.village === cityName
					) {
						const timeDiff =
							new Date(nextPoint.recorded_at).getTime() -
							new Date(currentPoint.recorded_at).getTime();
						if (timeDiff > 0) {
							totalTimeInCity += timeDiff;
						}
					}
				}

				// Only add to visited places if spent more than 1 hour (3600000 ms)
				if (totalTimeInCity > 3600000) {
					uniquePlaces.add(cityName);
				}
			}
		}

		// Track train station visits
		if (point.geocode?.amenity === 'train_station') {
			const stationName = point.geocode.name || point.geocode.display_name;
			if (stationName) {
				if (!stationVisits.has(stationName)) {
					stationVisits.set(stationName, []);
				}
				stationVisits.get(stationName)!.push(new Date(point.recorded_at).getTime());
			}
		}
	}

	// Calculate country distance distribution (replace time-based logic)
	const countryDistanceMap = new Map<string, number>();
	for (const p of trackerData) {
		if (p.country_code && p.transport_mode !== 'stationary') {
			const dist = typeof p.distance === 'number' && isFinite(p.distance) ? p.distance : 0;
			countryDistanceMap.set(p.country_code, (countryDistanceMap.get(p.country_code) || 0) + dist);
		}
	}
	const totalDistanceForCountries = Array.from(countryDistanceMap.values()).reduce(
		(a, b) => a + b,
		0
	);
	const countryDistanceDistribution: { country_code: string; distance: number; percent: number }[] =
		[];
	let percentSum = 0;
	let lastIdx = -1;
	Array.from(countryDistanceMap.entries()).forEach(([country_code, distance], idx) => {
		let percent = totalDistanceForCountries > 0 ? (distance / totalDistanceForCountries) * 100 : 0;
		percent = Math.round(percent * 100) / 100;
		percentSum += percent;
		lastIdx = idx;
		countryDistanceDistribution.push({ country_code, distance, percent });
	});
	// Adjust last value to ensure sum is 100%
	if (countryDistanceDistribution.length > 0 && percentSum !== 100) {
		const diff = Math.round((100 - percentSum) * 100) / 100;
		countryDistanceDistribution[lastIdx].percent += diff;
	}

	// Calculate transport statistics
	const totalTransportDistance = Object.values(transportModes).reduce(
		(sum, mode) => sum + mode.distance,
		0
	);
	const transport = Object.entries(transportModes).map(([mode, data]) => ({
		mode,
		distance: Math.round((data.distance / 1000) * 100) / 100, // Convert to km
		percentage:
			totalTransportDistance > 0 ? Math.round((data.distance / totalTransportDistance) * 100) : 0,
		time: Math.round(data.time / 1000), // Convert to seconds
		points: data.points // Include point count
	}));

	// Sort transport by distance
	transport.sort((a, b) => b.distance - a.distance);

	// Calculate activity data
	activityData.push({
		label: 'Moving Distance',
		distance: Math.round((totalDistance / 1000) * 100) / 100,
		locations: uniquePlaces.size
	});

	// Calculate train station visits
	for (const [stationName, timestamps] of stationVisits.entries()) {
		// Sort by time
		timestamps.sort((a, b) => a - b);

		// Count visits, skipping points within 1 hour of previous
		let count = 0;
		let lastVisit = -Infinity;
		for (const timestamp of timestamps) {
			if (timestamp - lastVisit > 3600 * 1000) {
				// 1 hour in milliseconds
				count++;
				lastVisit = timestamp;
			}
		}

		if (count > 0) {
			trainStationVisits.push({ name: stationName, count });
		}
	}

	// Sort by visit count (descending)
	trainStationVisits.sort((a, b) => b.count - a.count);

	// Calculate final metrics
	const totalDistanceKm = totalDistance / 1000;
	const earthCircumferences = totalDistanceKm / 40075; // Earth circumference in km
	const timeSpentMovingHours = Math.round((timeSpentMoving / (1000 * 60 * 60)) * 100) / 100;
	const totalUniquePlaces = uniquePlaces.size;
	const countriesVisited = uniqueCountries.size;
	const visitedPlaces = uniquePlaces.size;

	// Calculate steps from walking distance
	const walking = transport.find((t) => t.mode === 'walking');
	const steps = walking ? Math.round((walking.distance * 1000) / 0.7) : 0;

	return {
		totalDistance: isFinite(totalDistanceKm)
			? totalDistanceKm >= 1000
				? `${(totalDistanceKm / 1000).toFixed(1)}k km`
				: `${totalDistanceKm.toFixed(1)} km`
			: '0 km',
		earthCircumferences: earthCircumferences,
		locationsVisited: totalUniquePlaces.toString(),
		timeSpent: `${Math.round(timeSpentMoving / (1000 * 60 * 60 * 24))} days`,
		timeSpentMoving: `${timeSpentMovingHours}h`,
		geopoints: geopoints || 0,
		steps,
		uniquePlaces: totalUniquePlaces,
		countriesVisited,
		activity: activityData,
		transport: transport,
		countryTimeDistribution: countryDistanceDistribution,
		visitedPlaces,
		trainStationVisits
	};
}

// Haversine distance calculation
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371e3; // metres
	const toRad = (x: number) => (x * Math.PI) / 180;
	const φ1 = toRad(lat1);
	const φ2 = toRad(lat2);
	const Δφ = toRad(lat2 - lat1);
	const Δλ = toRad(lon2 - lon1);
	const a =
		Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c; // in metres
}
