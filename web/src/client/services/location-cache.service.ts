interface LocationData {
	id: string;
	name?: string;
	description?: string;
	location: string;
	address?: string;
	created_at: string;
	updated_at?: string;
	type: 'location' | 'poi' | 'tracker';
	coordinates: { lat: number; lng: number } | null;
	category?: string;
	rating?: number;
	tracker_type?: string;
	device_id?: string;
	recorded_at?: string;
	altitude?: number;
	accuracy?: number;
	speed?: number;
	heading?: number;
	battery_level?: boolean;
	is_charging?: boolean;
	activity_type?: string;
}

interface CachedLocationData {
	data: LocationData[];
	timestamp: number;
	filters: {
		startDate?: string;
		endDate?: string;
		period?: string;
	};
	total: number;
	hasMore: boolean;
}

interface CacheKey {
	startDate?: string;
	endDate?: string;
	period?: string;
	offset: number;
	limit: number;
}

interface DayCacheKey {
	date: string; // YYYY-MM-DD format
	offset: number;
	limit: number;
}

export class LocationCacheService {
	private static readonly CACHE_PREFIX = 'wayli_locations_';
	private static readonly DAY_CACHE_PREFIX = 'wayli_day_';
	private static readonly CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes
	private static readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB

	/**
	 * Generate a cache key from filters and pagination
	 */
	static generateCacheKey(filters: CacheKey): string {
		const key = {
			startDate: filters.startDate || 'none',
			endDate: filters.endDate || 'none',
			period: filters.period || 'none',
			offset: filters.offset,
			limit: filters.limit
		};
		return this.CACHE_PREFIX + btoa(JSON.stringify(key));
	}

	/**
	 * Generate a day-specific cache key
	 */
	static generateDayCacheKey(dayKey: DayCacheKey): string {
		const key = {
			date: dayKey.date,
			offset: dayKey.offset,
			limit: dayKey.limit
		};
		return this.DAY_CACHE_PREFIX + btoa(JSON.stringify(key));
	}

	/**
	 * Get cached data if it exists and is not expired
	 */
	static getCachedData(filters: CacheKey): CachedLocationData | null {
		try {
			const key = this.generateCacheKey(filters);
			const cached = localStorage.getItem(key);

			if (!cached) return null;

			const parsed: CachedLocationData = JSON.parse(cached);
			const now = Date.now();

			// Check if cache is expired
			if (now - parsed.timestamp > this.CACHE_EXPIRY) {
				localStorage.removeItem(key);
				return null;
			}

			console.log(`Cache hit for key: ${key}`);
			return parsed;
		} catch (error) {
			console.error('Error reading from cache:', error);
			return null;
		}
	}

	/**
	 * Get cached data for a specific day
	 */
	static getDayCachedData(dayKey: DayCacheKey): LocationData[] | null {
		try {
			const key = this.generateDayCacheKey(dayKey);
			const cached = localStorage.getItem(key);

			if (!cached) return null;

			const parsed: { data: LocationData[]; timestamp: number } = JSON.parse(cached);
			const now = Date.now();

			// Check if cache is expired
			if (now - parsed.timestamp > this.CACHE_EXPIRY) {
				localStorage.removeItem(key);
				return null;
			}

			console.log(`Day cache hit for key: ${key}`);
			return parsed.data;
		} catch (error) {
			console.error('Error reading from day cache:', error);
			return null;
		}
	}

	/**
	 * Store data in cache
	 */
	static setCachedData(
		filters: CacheKey,
		data: LocationData[],
		total: number,
		hasMore: boolean
	): void {
		try {
			const key = this.generateCacheKey(filters);
			const cacheData: CachedLocationData = {
				data,
				timestamp: Date.now(),
				filters: {
					startDate: filters.startDate,
					endDate: filters.endDate,
					period: filters.period
				},
				total,
				hasMore
			};

			// Check cache size before storing
			if (this.getCacheSize() > this.MAX_CACHE_SIZE) {
				this.cleanupCache();
			}

			localStorage.setItem(key, JSON.stringify(cacheData));
			console.log(`Cached data for key: ${key}, size: ${JSON.stringify(cacheData).length} bytes`);

			// Also cache data by individual days for better reuse
			this.cacheDataByDays(data);
		} catch (error) {
			console.error('Error writing to cache:', error);
			// If localStorage is full, try to clean up and retry
			if (error instanceof Error && error.name === 'QuotaExceededError') {
				this.cleanupCache();
				try {
					const key = this.generateCacheKey(filters);
					const cacheData: CachedLocationData = {
						data,
						timestamp: Date.now(),
						filters: {
							startDate: filters.startDate,
							endDate: filters.endDate,
							period: filters.period
						},
						total,
						hasMore
					};
					localStorage.setItem(key, JSON.stringify(cacheData));
					this.cacheDataByDays(data);
				} catch (retryError) {
					console.error('Failed to cache data after cleanup:', retryError);
				}
			}
		}
	}

	/**
	 * Cache data by individual days
	 */
	private static cacheDataByDays(data: LocationData[]): void {
		try {
			// Group data by day
			const dataByDay = new Map<string, LocationData[]>();

			data.forEach((item) => {
				const date = this.getDateFromItem(item);
				if (date) {
					if (!dataByDay.has(date)) {
						dataByDay.set(date, []);
					}
					dataByDay.get(date)!.push(item);
				}
			});

			// Cache each day's data separately
			dataByDay.forEach((dayData, date) => {
				const dayKey: DayCacheKey = {
					date,
					offset: 0,
					limit: dayData.length
				};

				const key = this.generateDayCacheKey(dayKey);
				const cacheData = {
					data: dayData,
					timestamp: Date.now()
				};

				localStorage.setItem(key, JSON.stringify(cacheData));
				console.log(`Cached day data for ${date}: ${dayData.length} items`);
			});
		} catch (error) {
			console.error('Error caching data by days:', error);
		}
	}

	/**
	 * Extract date from location item
	 */
	private static getDateFromItem(item: LocationData): string | null {
		try {
			const dateStr = item.recorded_at || item.created_at;
			if (!dateStr) return null;

			const date = new Date(dateStr);
			return date.toISOString().split('T')[0]; // YYYY-MM-DD format
		} catch (error) {
			console.error('Error extracting date from item:', error);
			return null;
		}
	}

	/**
	 * Get data for a specific date range by combining day caches
	 */
	static getCachedDataForDateRange(startDate: string, endDate: string): LocationData[] | null {
		try {
			const start = new Date(startDate);
			const end = new Date(endDate);
			const allData: LocationData[] = [];

			// Iterate through each day in the range
			for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
				const dateStr = d.toISOString().split('T')[0];
				const dayKey: DayCacheKey = {
					date: dateStr,
					offset: 0,
					limit: 10000 // Large limit to get all data for the day
				};

				const dayData = this.getDayCachedData(dayKey);
				if (dayData) {
					allData.push(...dayData);
				}
			}

			return allData.length > 0 ? allData : null;
		} catch (error) {
			console.error('Error getting cached data for date range:', error);
			return null;
		}
	}

	/**
	 * Clear all cached location data
	 */
	static clearCache(): void {
		try {
			const keys = Object.keys(localStorage);
			const locationKeys = keys.filter(
				(key) => key.startsWith(this.CACHE_PREFIX) || key.startsWith(this.DAY_CACHE_PREFIX)
			);
			locationKeys.forEach((key) => localStorage.removeItem(key));
			console.log(`Cleared ${locationKeys.length} cached location entries`);
		} catch (error) {
			console.error('Error clearing cache:', error);
		}
	}

	/**
	 * Get total cache size in bytes
	 */
	private static getCacheSize(): number {
		try {
			let totalSize = 0;
			const keys = Object.keys(localStorage);
			const locationKeys = keys.filter(
				(key) => key.startsWith(this.CACHE_PREFIX) || key.startsWith(this.DAY_CACHE_PREFIX)
			);

			locationKeys.forEach((key) => {
				const value = localStorage.getItem(key);
				if (value) {
					totalSize += key.length + value.length;
				}
			});

			return totalSize;
		} catch (error) {
			console.error('Error calculating cache size:', error);
			return 0;
		}
	}

	/**
	 * Clean up old cache entries
	 */
	private static cleanupCache(): void {
		try {
			const keys = Object.keys(localStorage);
			const locationKeys = keys.filter(
				(key) => key.startsWith(this.CACHE_PREFIX) || key.startsWith(this.DAY_CACHE_PREFIX)
			);

			// Get all cached entries with their timestamps
			const entries = locationKeys
				.map((key) => {
					try {
						const cached = localStorage.getItem(key);
						if (cached) {
							const parsed: CachedLocationData | { timestamp: number } = JSON.parse(cached);
							return { key, timestamp: parsed.timestamp };
						}
					} catch {
						// Invalid cache entry, remove it
						localStorage.removeItem(key);
					}
					return null;
				})
				.filter(Boolean) as { key: string; timestamp: number }[];

			// Sort by timestamp (oldest first)
			entries.sort((a, b) => a.timestamp - b.timestamp);

			// Remove oldest entries until we're under the limit
			const targetSize = this.MAX_CACHE_SIZE * 0.8; // Leave 20% buffer
			let currentSize = this.getCacheSize();

			for (const entry of entries) {
				if (currentSize <= targetSize) break;

				const value = localStorage.getItem(entry.key);
				if (value) {
					currentSize -= entry.key.length + value.length;
					localStorage.removeItem(entry.key);
				}
			}

			console.log(`Cache cleanup completed. Current size: ${currentSize} bytes`);
		} catch (error) {
			console.error('Error during cache cleanup:', error);
		}
	}

	/**
	 * Get cache statistics
	 */
	static getCacheStats(): { entries: number; size: number; maxSize: number } {
		try {
			const keys = Object.keys(localStorage);
			const locationKeys = keys.filter(
				(key) => key.startsWith(this.CACHE_PREFIX) || key.startsWith(this.DAY_CACHE_PREFIX)
			);
			const size = this.getCacheSize();

			return {
				entries: locationKeys.length,
				size,
				maxSize: this.MAX_CACHE_SIZE
			};
		} catch (error) {
			console.error('Error getting cache stats:', error);
			return { entries: 0, size: 0, maxSize: this.MAX_CACHE_SIZE };
		}
	}
}
