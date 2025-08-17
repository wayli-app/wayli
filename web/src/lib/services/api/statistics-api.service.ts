// src/lib/services/api/statistics-api.service.ts
// Statistics API service layer - extracts business logic from statistics API routes

import { errorHandler, ErrorCode } from '../error-handler.service';

import type { SupabaseClient } from '@supabase/supabase-js';

export interface StatisticsApiServiceConfig {
	supabase: SupabaseClient;
}

export interface GeocodingStats {
	total: number;
	geocoded: number;
	percentage: number;
	missing: number;
}

export interface LocationDataQuery {
	startDate?: string;
	endDate?: string;
	limit?: number;
	offset?: number;
	includeTrackerData?: boolean;
	includeLocations?: boolean;
	includePOIs?: boolean;
}

export interface LocationData {
	id: string;
	user_id: string;
	latitude: number;
	longitude: number;
	recorded_at: string;
	accuracy?: number;
	altitude?: number;
	speed?: number;
	heading?: number;
	battery_level?: number;
	is_charging?: boolean;
	activity_type?: string;
	transport_mode?: string;
	geocode?: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
}

export interface GetLocationDataResult {
	locations: LocationData[];
	total: number;
	hasMore: boolean;
}

export class StatisticsApiService {
	private supabase: SupabaseClient;

	constructor(config: StatisticsApiServiceConfig) {
		this.supabase = config.supabase;
	}

	/**
	 * Get geocoding statistics for a user
	 */
	async getGeocodingStats(userId: string): Promise<GeocodingStats> {
		try {
			// Get total count of tracker data points
			const { count: totalCount, error: totalError } = await this.supabase
				.from('tracker_data')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.not('location', 'is', null);

			if (totalError) {
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					`Failed to get total count: ${totalError.message}`,
					500,
					totalError,
					{ userId }
				);
			}

			// Get count of points that have geocode data (not null and not empty object)
			const { count: geocodedCount, error: geocodedError } = await this.supabase
				.from('tracker_data')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.not('location', 'is', null)
				.not('geocode', 'is', null)
				.neq('geocode', '{}');

			if (geocodedError) {
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					`Failed to get geocoded count: ${geocodedError.message}`,
					500,
					geocodedError,
					{ userId }
				);
			}

			const total = totalCount || 0;
			const geocoded = geocodedCount || 0;
			const percentage = total > 0 ? Math.round((geocoded / total) * 100) : 0;

			return {
				total,
				geocoded,
				percentage,
				missing: total - geocoded
			};
		} catch (error) {
			if (error instanceof Error && error.message.includes('Failed to get')) {
				throw error;
			}
			throw errorHandler.createError(
				ErrorCode.DATABASE_ERROR,
				'Failed to fetch geocoding statistics',
				500,
				error,
				{ userId }
			);
		}
	}

	/**
	 * Get location data for a user with filtering and pagination
	 */
	async getLocationData(
		userId: string,
		query: LocationDataQuery = {}
	): Promise<GetLocationDataResult> {
		try {
			const { startDate, endDate, limit = 5000, offset = 0 } = query;

			// Validate limit
			if (limit > 10000) {
				throw errorHandler.createError(
					ErrorCode.VALIDATION_ERROR,
					'Limit cannot exceed 10000',
					400,
					{ limit }
				);
			}

			// Build query
			let queryBuilder = this.supabase
				.from('tracker_data')
				.select('*')
				.eq('user_id', userId)
				.not('location', 'is', null)
				.order('recorded_at', { ascending: false })
				.range(offset, offset + limit - 1);

			// Add date filters if provided
			if (startDate) {
				queryBuilder = queryBuilder.gte('recorded_at', startDate);
			}
			if (endDate) {
				queryBuilder = queryBuilder.lte('recorded_at', endDate);
			}

			// Execute query
			const { data: locations, error } = await queryBuilder;

			if (error) {
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					`Failed to fetch location data: ${error.message}`,
					500,
					error,
					{ userId, query }
				);
			}

			// Get total count for pagination
			const { count: totalCount, error: countError } = await this.supabase
				.from('tracker_data')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.not('location', 'is', null);

			if (countError) {
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					`Failed to get total count: ${countError.message}`,
					500,
					countError,
					{ userId }
				);
			}

			const total = totalCount || 0;
			const hasMore = offset + limit < total;

			return {
				locations: locations || [],
				total,
				hasMore
			};
		} catch (error) {
			if (error instanceof Error && error.message.includes('Failed to')) {
				throw error;
			}
			throw errorHandler.createError(
				ErrorCode.DATABASE_ERROR,
				'Failed to fetch location data',
				500,
				error,
				{ userId, query }
			);
		}
	}

	/**
	 * Get comprehensive statistics for a user
	 */
	async getComprehensiveStats(
		userId: string,
		startDate?: string,
		endDate?: string
	): Promise<Record<string, unknown>> {
		try {
			// Get basic counts
			const { count: totalPoints, error: pointsError } = await this.supabase
				.from('tracker_data')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.not('location', 'is', null);

			if (pointsError) {
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					`Failed to get total points: ${pointsError.message}`,
					500,
					pointsError,
					{ userId }
				);
			}

			// Get geocoding stats
			const geocodingStats = await this.getGeocodingStats(userId);

			// Get transport mode distribution
			const { data: transportModes, error: transportError } = await this.supabase
				.from('tracker_data')
				.select('transport_mode')
				.eq('user_id', userId)
				.not('transport_mode', 'is', null);

			if (transportError) {
				throw errorHandler.createError(
					ErrorCode.DATABASE_ERROR,
					`Failed to get transport modes: ${transportError.message}`,
					500,
					transportError,
					{ userId }
				);
			}

			// Calculate transport mode distribution
			const modeDistribution =
				transportModes?.reduce(
					(acc, item) => {
						const mode = item.transport_mode || 'unknown';
						acc[mode] = (acc[mode] || 0) + 1;
						return acc;
					},
					{} as Record<string, number>
				) || {};

			return {
				totalPoints: totalPoints || 0,
				geocoding: geocodingStats,
				transportModes: modeDistribution,
				dateRange: {
					startDate,
					endDate
				}
			};
		} catch (error) {
			if (error instanceof Error && error.message.includes('Failed to')) {
				throw error;
			}
			throw errorHandler.createError(
				ErrorCode.DATABASE_ERROR,
				'Failed to fetch comprehensive statistics',
				500,
				error,
				{ userId, startDate, endDate }
			);
		}
	}

	/**
	 * Validate location data query parameters
	 */
	validateLocationDataQuery(query: LocationDataQuery): void {
		const { limit, startDate, endDate } = query;

		// Validate limit
		if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 10000)) {
			throw errorHandler.createError(
				ErrorCode.VALIDATION_ERROR,
				'Limit must be a number between 1 and 10000',
				400,
				{ field: 'limit', value: limit }
			);
		}

		// Validate dates
		if (startDate && !this.isValidDate(startDate)) {
			throw errorHandler.createError(
				ErrorCode.VALIDATION_ERROR,
				'Start date must be a valid ISO date string',
				400,
				{ field: 'startDate', value: startDate }
			);
		}

		if (endDate && !this.isValidDate(endDate)) {
			throw errorHandler.createError(
				ErrorCode.VALIDATION_ERROR,
				'End date must be a valid ISO date string',
				400,
				{ field: 'endDate', value: endDate }
			);
		}

		// Validate date range
		if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
			throw errorHandler.createError(
				ErrorCode.VALIDATION_ERROR,
				'Start date must be before end date',
				400,
				{ startDate, endDate }
			);
		}
	}

	/**
	 * Check if a string is a valid date
	 */
	private isValidDate(dateString: string): boolean {
		const date = new Date(dateString);
		return !isNaN(date.getTime());
	}
}
