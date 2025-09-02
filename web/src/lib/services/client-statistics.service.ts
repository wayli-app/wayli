// src/lib/services/client-statistics.service.ts
// Client-side statistics calculation service for processing tracker data incrementally

import { supabase } from '$lib/supabase';
import {
	detectEnhancedMode,
	haversine,
	type EnhancedModeContext,
	isAtTrainStation,
	getTrainStationName,
	isAtAirport,
	getAirportName
} from '$lib/utils/transport-mode';
import type { GeocodeGeoJSONFeature } from '$lib/utils/geojson-converter';
import { TransportDetectionReason } from '$lib/types/transport-mode.types';

import type { SupabaseClient } from '@supabase/supabase-js';

// Type for visit data tracking
export interface VisitData {
	visitCount: number;
	timeSpent: number; // in milliseconds
	lastVisit: string; // ISO timestamp
}

// Optimized data structure for statistics calculation
export interface ClientStatistics {
	// Basic counts
	totalPoints: number;
	geopoints: number;

	// Distance and time
	totalDistance: number; // in meters
	timeSpentMoving: number; // in milliseconds

	// Unique tracking (using Maps for efficiency)
	uniqueCities: Map<string, VisitData>; // city key -> visit data
	uniqueCountries: Map<string, VisitData>; // country code -> visit data

	// Transport mode statistics
	transportModes: Map<
		string,
		{
			distance: number;
			time: number;
			points: number;
		}
	>;

	// Train station visits
	trainStationVisits: Map<string, number[]>; // station name -> timestamps

	// Country time distribution
	countryTimeDistribution: Map<string, number>; // country code -> time in ms

	// Geocoding statistics
	geocodingStats: {
		total: number;
		geocoded: number;
		successRate: number;
	};

	// Metadata
	dateRange: {
		startDate?: string;
		endDate?: string;
	};
	lastProcessedAt?: string;
}

// Raw tracker data point (minimal fields for processing)
export interface TrackerDataPoint {
	recorded_at: string;
	time_spent?: number;
	country_code?: string;
	location?: { type: string; coordinates: number[]; crs?: { type: string; properties: { name: string } } }; // GeoJSON Point object
	coordinates?: number[]; // GeoJSON coordinates array [lon, lat] (fallback)
	speed?: number; // Speed in m/s from database
	distance?: number; // Distance in meters from previous point
	tz_diff?: number; // Timezone difference from UTC in hours
	type?: string;
	class?: string;
	addresstype?: string;
	city?: string;
	village?: string;
	transport_mode?: string;
	velocity?: number;
	detection_reason?: string;
}

// Progress callback for loading updates
export type ProgressCallback = (progress: {
	percentage: number;
	stage: string;
	pointsLoaded: number;
	totalPoints: number;
	currentBatch: number;
	totalBatches: number;
}) => void;

// Error callback for handling errors
export type ErrorCallback = (error: Error, canRetry: boolean) => void;

export class ClientStatisticsService {
	private supabase: SupabaseClient;
	private statistics: ClientStatistics;
	private transportContext: EnhancedModeContext;
	private isProcessing: boolean = false;
	private currentOffset: number = 0;
	private totalCount: number = 0;
	private batchSize: number = 1000;
	private maxRetries: number = 3;
	private retryDelay: number = 1000; // 1 second
	private rawDataPoints: TrackerDataPoint[] = [];

	constructor(supabaseClient?: SupabaseClient) {
		this.supabase = supabaseClient || supabase;
		this.statistics = this.initializeStatistics();
		this.transportContext = this.initializeTransportContext();
	}

	/**
	 * Initialize empty statistics object
	 */
	private initializeStatistics(): ClientStatistics {
		return {
			totalPoints: 0,
			geopoints: 0,
			totalDistance: 0,
			timeSpentMoving: 0,
			uniqueCities: new Map(),
			uniqueCountries: new Map(),
			transportModes: new Map(),
			trainStationVisits: new Map(),
			countryTimeDistribution: new Map(),
			geocodingStats: {
				total: 0,
				geocoded: 0,
				successRate: 0
			},
			dateRange: {}
		};
	}

	/**
	 * Create a GeoJSON Feature object from tracker data point
	 */
	private createGeocodeFeature(point: TrackerDataPoint): GeocodeGeoJSONFeature | null {
		const coords = this.extractCoordinates(point);
		if (!coords) return null;

		return {
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [coords[0], coords[1]] // [lng, lat]
			},
			properties: {
				type: point.type || undefined,
				class: point.class || undefined,
				addresstype: point.addresstype || undefined,
				address: {
					...(point.city && { city: point.city }),
					...(point.village && { village: point.village })
				},
				geocoded_at: new Date().toISOString(),
				geocoding_provider: 'database'
			}
		};
	}

	/**
	 * Initialize transport mode detection context
	 */
	private initializeTransportContext(): EnhancedModeContext {
		return {
			currentMode: 'unknown',
			lastSpeed: 0,

			// Train tracking
			trainStations: [],
			isInTrainJourney: false,

			// Airport tracking (Phase 1)
			airports: [],
			isInAirplaneJourney: false,

			// Speed and history tracking (Phase 1)
			averageSpeed: 0,
			speedHistory: [],
			modeHistory: [],

			// Distance tracking (Phase 1)
			totalDistanceTraveled: 0
		};
	}

	/**
	 * Get total count of tracker data points for a user
	 */
	async getTotalCount(userId: string, startDate?: string, endDate?: string): Promise<number> {
		console.log('📊 Getting total count for user:', userId);

		let query = this.supabase
			.from('tracker_data')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.not('location', 'is', null);

		if (startDate) {
			query = query.gte('recorded_at', startDate);
		}
		if (endDate) {
			query = query.lte('recorded_at', endDate + ' 23:59:59');
		}

		const { count, error } = await query;

		if (error) {
			console.error('❌ Error getting total count:', error);
			throw new Error(`Failed to get total count: ${error.message}`);
		}

		const total = count || 0;
		console.log(`📊 Total count: ${total.toLocaleString()} points`);
		return total;
	}

	/**
	 * Load and process tracker data in batches
	 */
	async loadAndProcessData(
		userId: string,
		startDate?: string,
		endDate?: string,
		onProgress?: ProgressCallback,
		onError?: ErrorCallback
	): Promise<ClientStatistics> {
		if (this.isProcessing) {
			throw new Error('Already processing data');
		}

		this.isProcessing = true;
		this.statistics = this.initializeStatistics();
		this.transportContext = this.initializeTransportContext();
		this.currentOffset = 0;

		try {
			// Get total count first
			onProgress?.({
				percentage: 0,
				stage: 'Counting records...',
				pointsLoaded: 0,
				totalPoints: 0,
				currentBatch: 0,
				totalBatches: 0
			});

			this.totalCount = await this.getTotalCount(userId, startDate, endDate);
			this.statistics.dateRange = { startDate, endDate };

			if (this.totalCount === 0) {
				onProgress?.({
					percentage: 100,
					stage: 'No data found',
					pointsLoaded: 0,
					totalPoints: 0,
					currentBatch: 0,
					totalBatches: 0
				});
				return this.statistics;
			}

			const totalBatches = Math.ceil(this.totalCount / this.batchSize);
			let pointsLoaded = 0;
			let batchesCompleted = 0;

			onProgress?.({
				percentage: 0,
				stage: `Found ${this.totalCount.toLocaleString()} records. Loading data...`,
				pointsLoaded: 0,
				totalPoints: this.totalCount,
				currentBatch: 0,
				totalBatches
			});

			// Load data in batches
			while (this.currentOffset < this.totalCount) {
				const currentBatch = Math.floor(this.currentOffset / this.batchSize) + 1;

				onProgress?.({
					percentage: Math.round((batchesCompleted / totalBatches) * 100),
					stage: `Loading batch ${currentBatch} of ${totalBatches}...`,
					pointsLoaded,
					totalPoints: this.totalCount,
					currentBatch,
					totalBatches
				});

				const batchData = await this.loadBatch(userId, startDate, endDate);
				if (batchData.length === 0) break;

				// Process the batch
				this.processBatch(batchData);
				pointsLoaded += batchData.length;
				this.currentOffset += this.batchSize;
				batchesCompleted++;

				// Small delay to prevent overwhelming the browser
				await new Promise((resolve) => setTimeout(resolve, 10));
			}

			// Finalize statistics
			this.finalizeStatistics();

			onProgress?.({
				percentage: 100,
				stage: 'Processing complete!',
				pointsLoaded,
				totalPoints: this.totalCount,
				currentBatch: totalBatches,
				totalBatches
			});

			return this.statistics;
		} catch (error) {
			console.error('❌ Error loading and processing data:', error);
			onError?.(error as Error, true);
			throw error;
		} finally {
			this.isProcessing = false;
		}
	}

	/**
	 * Load a single batch of tracker data
	 */
	private async loadBatch(
		userId: string,
		startDate?: string,
		endDate?: string
	): Promise<TrackerDataPoint[]> {
		let query = this.supabase
			.from('tracker_data')
			.select(`
				recorded_at,
				time_spent,
				country_code,
				location,
				speed,
				distance,
				tz_diff,
				geocode->properties->>type,
				geocode->properties->>class,
				geocode->properties->>addresstype,
				geocode->properties->address->>city,
				geocode->properties->address->>village
			`)
			.eq('user_id', userId)
			.not('location', 'is', null)
			.order('recorded_at', { ascending: true })
			.range(this.currentOffset, this.currentOffset + this.batchSize - 1);

		if (startDate) {
			query = query.gte('recorded_at', startDate);
		}
		if (endDate) {
			query = query.lte('recorded_at', endDate + ' 23:59:59');
		}

		const { data, error } = await query;

		if (error) {
			console.error('❌ Error loading batch:', error);
			throw new Error(`Failed to load batch: ${error.message}`);
		}

		return (data as any) || [];
	}

	/**
	 * Process a batch of tracker data points
	 */
	private processBatch(batch: TrackerDataPoint[]): void {
		console.log(`🔄 Processing batch of ${batch.length} points`);

		// Process points and add transport mode information
		const processedBatch = batch.map((point, index) => {
			const nextPoint = batch[index + 1];
			let transportMode = 'unknown';
			let velocity = 0;
			let detectionReason = 'unknown';

			// Determine transport mode using database speed field
			if (point.speed !== undefined && point.speed !== null) {
				// Use database speed field for transport mode detection
				const currentCoords = this.extractCoordinates(point);

				if (currentCoords) {
					// Create proper GeoJSON Feature for transport mode detection
					const currentGeocode = this.createGeocodeFeature(point);

					// Use database speed in m/s for transport mode detection
					const { mode, reason } = detectEnhancedMode(
						currentCoords[1], currentCoords[0], // lat, lng
						currentCoords[1], currentCoords[0], // same coordinates since we're using database speed
						1, // dummy time since we're using database speed
						currentGeocode,
						this.transportContext,
						point.speed // pass database speed in m/s
					);

					transportMode = mode;
					detectionReason = reason;

					// Convert database speed to km/h for velocity display
					velocity = point.speed * 3.6;
					console.log(`🚗 Using database speed: ${point.speed.toFixed(2)} m/s (${velocity.toFixed(2)} km/h) for transport mode: ${mode}`);
				}
			} else if (nextPoint) {
				// Fallback to calculated velocity if no database speed available
				const currentCoords = this.extractCoordinates(point);
				const nextCoords = this.extractCoordinates(nextPoint);

				if (currentCoords && nextCoords) {
					const distance = haversine(
						currentCoords[1], currentCoords[0], // lat, lng
						nextCoords[1], nextCoords[0]
					);
					const timeSpent = this.calculateTimeSpent(point, nextPoint);

					if (timeSpent > 0) {
						// Calculate velocity in km/h
						velocity = (distance / timeSpent) * 3.6;
						console.log(`🚗 Fallback velocity calculation: distance=${distance.toFixed(2)}m, time=${timeSpent}ms, velocity=${velocity.toFixed(2)}km/h`);

						// Create proper GeoJSON Feature for transport mode detection
						const currentGeocode = this.createGeocodeFeature(point);

						const { mode, reason } = detectEnhancedMode(
							currentCoords[1], currentCoords[0], // prev lat, lng
							nextCoords[1], nextCoords[0], // curr lat, lng
							timeSpent / 1000, // convert to seconds
							currentGeocode,
							this.transportContext
						);

						transportMode = mode;
						detectionReason = reason;
					}
				}
			}

			// Add transport mode, velocity, and detection reason to the point
			return {
				...point,
				transport_mode: transportMode,
				velocity: velocity,
				detection_reason: detectionReason
			};
		});

		// Store processed data points for map visualization with lat/lon properties
		const mapDataPoints = processedBatch.map(point => {
			const coords = this.extractCoordinates(point);
			return {
				...point,
				lat: coords?.[1] || null,
				lon: coords?.[0] || null
			};
		});
		this.rawDataPoints.push(...mapDataPoints);

		for (let i = 0; i < processedBatch.length; i++) {
			const point = processedBatch[i];
			const nextPoint = processedBatch[i + 1];

			// Basic counting
			this.statistics.totalPoints++;
			this.statistics.geopoints++;

			// Process geocoding statistics
			this.processGeocodingStats(point);

			// Process country and place data
			this.processLocationData(point);

			// Process transport mode and distance/time
			if (nextPoint) {
				this.processTransportMode(point, nextPoint);
			}

			// Process train station visits
			this.processTrainStationVisit(point);
		}
	}

	/**
	 * Process geocoding statistics for a point
	 */
	private processGeocodingStats(point: TrackerDataPoint): void {
		this.statistics.geocodingStats.total++;

		if (this.hasValidGeocode(point)) {
			this.statistics.geocodingStats.geocoded++;
		}
	}

	/**
	 * Check if geocode data is valid and useful
	 */
	private hasValidGeocode(point: TrackerDataPoint): boolean {
		return !!(
			point.coordinates ||
			point.type ||
			point.class
		);
	}

	/**
	 * Process location data (countries and unique places)
	 */
	private processLocationData(point: TrackerDataPoint): void {
		// Process country
		if (point.country_code) {
			const existing = this.statistics.uniqueCountries.get(point.country_code) || {
				visitCount: 0,
				timeSpent: 0,
				lastVisit: point.recorded_at
			};

			existing.visitCount++;
			existing.lastVisit = point.recorded_at;

			// Add time spent at this point (will be updated when we process transport mode)
			if (typeof point.time_spent === 'number' && point.time_spent > 0) {
				existing.timeSpent += point.time_spent * 1000; // convert to milliseconds
			}

			this.statistics.uniqueCountries.set(point.country_code, existing);
		}

		// Process unique cities
		if (point.type || point.addresstype) {
			const cityKey = this.generateCityKey(point);
			if (cityKey) {
				const existing = this.statistics.uniqueCities.get(cityKey) || {
					visitCount: 0,
					timeSpent: 0,
					lastVisit: point.recorded_at
				};

				existing.visitCount++;
				existing.lastVisit = point.recorded_at;

				// Add time spent at this point (will be updated when we process transport mode)
				if (typeof point.time_spent === 'number' && point.time_spent > 0) {
					existing.timeSpent += point.time_spent * 1000; // convert to milliseconds
				}

				this.statistics.uniqueCities.set(cityKey, existing);
			}
		}
	}

	/**
	 * Generate a unique key for a city based on geocode data
	 */
	private generateCityKey(point: TrackerDataPoint): string | null {
		// Use city/village from address properties, fallback to type/class
		const city = point.city || point.village;
		const type = point.type;
		const addresstype = point.addresstype;
		const country = point.country_code;

		// Create a location identifier from available data
		const location = city || type || addresstype;

		if (location && country) {
			return `${location}, ${country}`;
		} else if (location) {
			return location;
		}

		return null;
	}

	/**
	 * Process transport mode detection and distance/time calculations
	 */
	private processTransportMode(current: TrackerDataPoint, next: TrackerDataPoint): void {
		// Extract coordinates from geocode
		const currentCoords = this.extractCoordinates(current);
		const nextCoords = this.extractCoordinates(next);

		if (!currentCoords || !nextCoords) return;

		// Calculate distance and time
		const distance = haversine(
			currentCoords[1],
			currentCoords[0], // lat, lng
			nextCoords[1],
			nextCoords[0]
		);

		const timeSpent = this.calculateTimeSpent(current, next);
		if (timeSpent <= 0) return;

		// Create proper GeoJSON Feature for transport mode detection
		const currentGeocode = this.createGeocodeFeature(current);

		// Detect transport mode
		const { mode } = detectEnhancedMode(
			currentCoords?.[1] || 0,
			currentCoords?.[0] || 0, // prev lat, lng
			nextCoords?.[1] || 0,
			nextCoords?.[0] || 0, // curr lat, lng
			timeSpent / 1000, // convert to seconds
			currentGeocode,
			this.transportContext
		);

		// Update statistics
		if (mode !== 'stationary') {
			this.statistics.totalDistance += distance;
			this.statistics.timeSpentMoving += timeSpent;
		}

		// Update transport mode statistics
		const modeStats = this.statistics.transportModes.get(mode) || {
			distance: 0,
			time: 0,
			points: 0
		};

		modeStats.distance += distance;
		modeStats.time += timeSpent;
		modeStats.points++;

		this.statistics.transportModes.set(mode, modeStats);

		// Update country time distribution
		if (current.country_code) {
			const currentTime = this.statistics.countryTimeDistribution.get(current.country_code) || 0;
			this.statistics.countryTimeDistribution.set(current.country_code, currentTime + timeSpent);

			// Also update the unique countries time spent
			const countryData = this.statistics.uniqueCountries.get(current.country_code);
			if (countryData) {
				countryData.timeSpent += timeSpent;
				this.statistics.uniqueCountries.set(current.country_code, countryData);
			}
		}

		// Update unique cities time spent
		if (current.type || current.addresstype) {
			const cityKey = this.generateCityKey(current);
			if (cityKey) {
				const cityData = this.statistics.uniqueCities.get(cityKey);
				if (cityData) {
					cityData.timeSpent += timeSpent;
					this.statistics.uniqueCities.set(cityKey, cityData);
				}
			}
		}
	}

	/**
	 * Extract coordinates from GeoJSON location field or geocode coordinates
	 */
	private extractCoordinates(point: TrackerDataPoint): [number, number] | null {
		// First try the GeoJSON location field
		if (point.location && typeof point.location === 'object' && point.location.coordinates && Array.isArray(point.location.coordinates) && point.location.coordinates.length >= 2) {
			const [lon, lat] = point.location.coordinates;
			if (!isNaN(lon) && !isNaN(lat)) {
				return [lon, lat]; // [lng, lat]
			}
		}

		// Fallback to geocode coordinates
		if (point.coordinates && Array.isArray(point.coordinates) && point.coordinates.length >= 2) {
			const [lon, lat] = point.coordinates;
			if (!isNaN(lon) && !isNaN(lat)) {
				return [lon, lat]; // [lng, lat]
			}
		}

		return null;
	}

	/**
	 * Calculate time spent between two points
	 */
	private calculateTimeSpent(current: TrackerDataPoint, next: TrackerDataPoint): number {
		// Use database-calculated time_spent if available
		if (typeof next.time_spent === 'number' && next.time_spent > 0) {
			return next.time_spent * 1000; // convert to milliseconds
		}

		// Fallback to timestamp difference
		const currentTime = new Date(current.recorded_at).getTime();
		const nextTime = new Date(next.recorded_at).getTime();
		const timeDiff = nextTime - currentTime;

		// Only count reasonable time differences (less than 1 hour)
		return timeDiff > 0 && timeDiff < 3600000 ? timeDiff : 0;
	}

	/**
	 * Process train station visits
	 */
	private processTrainStationVisit(point: TrackerDataPoint): void {
		// Create proper GeoJSON Feature for train station detection
		const geocode = this.createGeocodeFeature(point);
		if (!geocode) return;

		if (!isAtTrainStation(geocode)) return;

		const stationName = getTrainStationName(geocode);
		if (!stationName) return;

		const timestamp = new Date(point.recorded_at).getTime();
		const visits = this.statistics.trainStationVisits.get(stationName) || [];
		visits.push(timestamp);
		this.statistics.trainStationVisits.set(stationName, visits);
	}

	/**
	 * Finalize statistics calculations
	 */
	private finalizeStatistics(): void {
		console.log('🔧 Finalizing statistics...');

		// Calculate geocoding success rate
		this.statistics.geocodingStats.successRate =
			this.statistics.geocodingStats.total > 0
				? Math.round(
						(this.statistics.geocodingStats.geocoded / this.statistics.geocodingStats.total) * 100
					)
				: 0;

		// Filter out places and countries with short visits
		this.filterShortVisits();

		// Process train station visits (deduplicate visits within 1 hour)
		this.processTrainStationVisits();

		// Set last processed timestamp
		this.statistics.lastProcessedAt = new Date().toISOString();

		console.log('✅ Statistics finalized');
	}

	/**
	 * Filter out places and countries with short visits
	 */
	private filterShortVisits(): void {
		const MIN_VISIT_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

		// Filter unique cities
		const originalCitiesCount = this.statistics.uniqueCities.size;
		const filteredCities = new Map<string, VisitData>();

		for (const [cityKey, cityData] of this.statistics.uniqueCities.entries()) {
			if (cityData.timeSpent >= MIN_VISIT_TIME) {
				filteredCities.set(cityKey, cityData);
			}
		}

		this.statistics.uniqueCities = filteredCities;

		// Filter unique countries
		const originalCountriesCount = this.statistics.uniqueCountries.size;
		const filteredCountries = new Map<string, VisitData>();

		for (const [countryCode, countryData] of this.statistics.uniqueCountries.entries()) {
			if (countryData.timeSpent >= MIN_VISIT_TIME) {
				filteredCountries.set(countryCode, countryData);
			}
		}

		this.statistics.uniqueCountries = filteredCountries;

		console.log(`🔍 Filtered cities: ${filteredCities.size} (from ${originalCitiesCount})`);
		console.log(
			`🔍 Filtered countries: ${filteredCountries.size} (from ${originalCountriesCount})`
		);
	}

	/**
	 * Process and deduplicate train station visits
	 */
	private processTrainStationVisits(): void {
		const processedVisits = new Map<string, number>();

		for (const [stationName, timestamps] of this.statistics.trainStationVisits.entries()) {
			// Sort timestamps
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
				processedVisits.set(stationName, count);
			}
		}

		// Replace the raw timestamps with visit counts
		// Note: We need to convert the Map<string, number> to Map<string, number[]> for type compatibility
		// but since we're only using the count, we'll keep it as is and handle it in getFormattedStatistics
		this.statistics.trainStationVisits = processedVisits as any;
	}

	/**
	 * Get formatted statistics for display
	 */
	getFormattedStatistics(): any {
		const totalDistanceKm = this.statistics.totalDistance / 1000;
		const timeSpentMovingHours =
			Math.round((this.statistics.timeSpentMoving / (1000 * 60 * 60)) * 100) / 100;
		const earthCircumferences = totalDistanceKm / 40075; // Earth circumference in km

		// Convert transport modes map to array
		const transport = Array.from(this.statistics.transportModes.entries()).map(([mode, stats]) => ({
			mode,
			distance: Math.round((stats.distance / 1000) * 10) / 10, // convert to km, round to 1 decimal
			time: Math.round((stats.time / (1000 * 60 * 60)) * 10) / 10, // convert to hours, round to 1 decimal
			points: stats.points,
			percentage: Math.round(
				this.statistics.totalDistance > 0
					? (stats.distance / this.statistics.totalDistance) * 100
					: 0
			)
		}));

		// Convert country time distribution to array
		const countryTimeDistribution = Array.from(
			this.statistics.countryTimeDistribution.entries()
		).map(([country, time]) => ({
			country_code: country,
			percent: Math.min(100, Math.round(
				this.statistics.timeSpentMoving > 0 ? (time / this.statistics.timeSpentMoving) * 100 : 0
			))
		}));

		// Convert train station visits to array
		const trainStationVisits = Array.from(this.statistics.trainStationVisits.entries())
			.map(([name, count]) => ({
				name,
				count: typeof count === 'number' ? count : 0
			}))
			.sort((a, b) => b.count - a.count);

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
			geopoints: this.statistics.geopoints,
			timeSpentMoving: `${timeSpentMovingHours}h`,
			uniquePlaces: this.statistics.uniqueCities.size,
			countriesVisited: this.statistics.uniqueCountries.size,
			steps,
			transport,
			countryTimeDistribution,
			trainStationVisits,
			geocodingStats: this.statistics.geocodingStats,
			rawDataPoints: this.rawDataPoints // Include raw data points for map visualization
		};
	}

	/**
	 * Reset the service state
	 */
	reset(): void {
		this.statistics = this.initializeStatistics();
		this.transportContext = this.initializeTransportContext();
		this.currentOffset = 0;
		this.totalCount = 0;
		this.isProcessing = false;
		this.rawDataPoints = [];
	}

	/**
	 * Check if currently processing
	 */
	isCurrentlyProcessing(): boolean {
		return this.isProcessing;
	}

	/**
	 * Get current progress information
	 */
	getCurrentProgress(): {
		pointsLoaded: number;
		totalPoints: number;
		percentage: number;
	} {
		return {
			pointsLoaded: this.currentOffset,
			totalPoints: this.totalCount,
			percentage: this.totalCount > 0 ? (this.currentOffset / this.totalCount) * 100 : 0
		};
	}
}
