// web/src/lib/utils/timezone-utils.ts
// Timezone utilities for location-based timezone detection

/**
 * Get timezone for coordinates using a timezone lookup service
 * @param lat Latitude
 * @param lng Longitude
 * @returns Promise<string> Timezone identifier (e.g., 'America/New_York')
 */
export async function getTimezoneFromCoordinates(lat: number, lng: number): Promise<string> {
	try {
		// Simple timezone estimation based on longitude
		// This is a basic approximation - for more accuracy, you'd need a proper timezone database
		const timezoneOffset = Math.round(lng / 15);
		const timezoneNames = [
			'UTC-12',
			'UTC-11',
			'UTC-10',
			'UTC-9',
			'UTC-8',
			'UTC-7',
			'UTC-6',
			'UTC-5',
			'UTC-4',
			'UTC-3',
			'UTC-2',
			'UTC-1',
			'UTC',
			'UTC+1',
			'UTC+2',
			'UTC+3',
			'UTC+4',
			'UTC+5',
			'UTC+6',
			'UTC+7',
			'UTC+8',
			'UTC+9',
			'UTC+10',
			'UTC+11',
			'UTC+12'
		];

		// Map to common timezone identifiers
		const timezoneMap: Record<string, string> = {
			'UTC-12': 'Pacific/Wallis',
			'UTC-11': 'Pacific/Pago_Pago',
			'UTC-10': 'Pacific/Honolulu',
			'UTC-9': 'America/Anchorage',
			'UTC-8': 'America/Los_Angeles',
			'UTC-7': 'America/Denver',
			'UTC-6': 'America/Chicago',
			'UTC-5': 'America/New_York',
			'UTC-4': 'America/Halifax',
			'UTC-3': 'America/Sao_Paulo',
			'UTC-2': 'Atlantic/South_Georgia',
			'UTC-1': 'Atlantic/Azores',
			UTC: 'UTC',
			'UTC+1': 'Europe/Paris', // Also covers Berlin, Amsterdam, Rome
			'UTC+2': 'Europe/Athens', // Also covers Cairo, Johannesburg
			'UTC+3': 'Europe/Moscow',
			'UTC+4': 'Asia/Dubai',
			'UTC+5': 'Asia/Karachi',
			'UTC+6': 'Asia/Dhaka',
			'UTC+7': 'Asia/Bangkok',
			'UTC+8': 'Asia/Shanghai',
			'UTC+9': 'Asia/Tokyo',
			'UTC+10': 'Australia/Sydney',
			'UTC+11': 'Pacific/Guadalcanal',
			'UTC+12': 'Pacific/Auckland'
		};

		const estimatedTimezone = timezoneNames[timezoneOffset + 12] || 'UTC';
		return timezoneMap[estimatedTimezone] || 'UTC';
	} catch (error) {
		console.warn('⚠️ Error estimating timezone, falling back to UTC:', error);
		return 'UTC';
	}
}

/**
 * Format date in a specific timezone
 * @param date Date string or Date object
 * @param timezone Timezone identifier
 * @param format Date format string
 * @returns Formatted date string
 */
export function formatDateInTimezone(date: string | Date, timezone: string): string {
	try {
		const dateObj = typeof date === 'string' ? new Date(date) : date;

		// Create a formatter for the specific timezone with timezone name
		const formatter = new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			timeZoneName: 'short', // Shows CET/CEST, EST/EDT, etc.
			hour12: false
		});

		return formatter.format(dateObj);
	} catch (error) {
		console.warn('⚠️ Error formatting date in timezone, using local time:', error);
		// Fallback to local time formatting
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		return dateObj.toLocaleString('en-GB', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}
}

/**
 * Get timezone and format date for a location
 * @param date Date string or Date object
 * @param lat Latitude
 * @param lng Longitude
 * @param format Date format string
 * @returns Promise<string> Formatted date in local timezone
 */
export async function formatDateForLocation(
	date: string | Date,
	lat: number,
	lng: number
): Promise<string> {
	const timezone = await getTimezoneFromCoordinates(lat, lng);
	return formatDateInTimezone(date, timezone);
}

/**
 * Get IANA timezone from UTC offset (e.g., 1 -> 'Europe/Paris')
 * @param tzDiff UTC offset in hours (e.g., 1, -5, 0)
 * @returns IANA timezone identifier
 */
export function getTimezoneFromOffset(tzDiff: number): string {
	const timezoneMap: Record<string, string> = {
		'UTC-12': 'Pacific/Wallis',
		'UTC-11': 'Pacific/Pago_Pago',
		'UTC-10': 'Pacific/Honolulu',
		'UTC-9': 'America/Anchorage',
		'UTC-8': 'America/Los_Angeles',
		'UTC-7': 'America/Denver',
		'UTC-6': 'America/Chicago',
		'UTC-5': 'America/New_York',
		'UTC-4': 'America/Halifax',
		'UTC-3': 'America/Sao_Paulo',
		'UTC-2': 'Atlantic/South_Georgia',
		'UTC-1': 'Atlantic/Azores',
		UTC: 'UTC',
		'UTC+1': 'Europe/Paris',
		'UTC+2': 'Europe/Athens',
		'UTC+3': 'Europe/Moscow',
		'UTC+4': 'Asia/Dubai',
		'UTC+5': 'Asia/Karachi',
		'UTC+6': 'Asia/Dhaka',
		'UTC+7': 'Asia/Bangkok',
		'UTC+8': 'Asia/Shanghai',
		'UTC+9': 'Asia/Tokyo',
		'UTC+10': 'Australia/Sydney',
		'UTC+11': 'Pacific/Guadalcanal',
		'UTC+12': 'Pacific/Auckland'
	};

	const tzKey = tzDiff === 0 ? 'UTC' : `UTC${tzDiff > 0 ? '+' : ''}${tzDiff}`;
	return timezoneMap[tzKey] || 'UTC';
}
