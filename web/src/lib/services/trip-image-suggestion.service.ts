import { createWorkerClient } from '$lib/core/supabase/worker-client';

import { getTripBannerImageWithAttribution } from './external/pexels.service';

export interface TripLocationAnalysis {
	primaryCountry: string;
	primaryCity?: string;
	allCountries: string[];
	allCities: string[];
	countryStats: Record<string, number>;
	cityStats: Record<string, number>;
}

export interface TripImageSuggestion {
	imageUrl: string;
	attribution?: {
		source: 'pexels' | 'picsum' | 'placeholder';
		photographer?: string;
		photographerUrl?: string;
		pexelsUrl?: string;
	};
}

export class TripImageSuggestionService {
	private supabase = createWorkerClient();

	/**
	 * Analyze tracker data for a specific date range to determine the most visited country and city
	 */
	async analyzeTripLocations(
		userId: string,
		startDate: string,
		endDate: string
	): Promise<TripLocationAnalysis> {
		try {
			// Fetch tracker data for the date range
			const { data: trackerData, error } = await this.supabase
				.from('tracker_data')
				.select('country_code, geocode, recorded_at')
				.eq('user_id', userId)
				.gte('recorded_at', `${startDate}T00:00:00Z`)
				.lte('recorded_at', `${endDate}T23:59:59Z`)
				.not('country_code', 'is', null)
				.order('recorded_at', { ascending: true });

			if (error) {
				console.error('Error fetching tracker data for analysis:', error);
				throw error;
			}

			if (!trackerData || trackerData.length === 0) {
				return {
					primaryCountry: '',
					primaryCity: undefined,
					allCountries: [],
					allCities: [],
					countryStats: {},
					cityStats: {}
				};
			}

			// Count countries and cities
			const countryStats: Record<string, number> = {};
			const cityStats: Record<string, number> = {};
			const allCountries = new Set<string>();
			const allCities = new Set<string>();

			trackerData.forEach((point) => {
				// Count countries
				if (point.country_code) {
					const country = point.country_code.toUpperCase();
					countryStats[country] = (countryStats[country] || 0) + 1;
					allCountries.add(country);
				}

				// Count cities from geocode data
				if (point.geocode) {
					try {
						const geocode =
							typeof point.geocode === 'string' ? JSON.parse(point.geocode) : point.geocode;

						if (geocode && geocode.address) {
							const city =
								geocode.address.city ||
								geocode.address.town ||
								geocode.address.village ||
								geocode.address.suburb ||
								geocode.address.neighbourhood;

							if (city) {
								const cityKey = city.toLowerCase().trim();
								cityStats[cityKey] = (cityStats[cityKey] || 0) + 1;
								allCities.add(city);
							}
						}
					} catch (parseError) {
						// Ignore geocode parsing errors
						console.warn('Failed to parse geocode data:', parseError);
					}
				}
			});

			// Find primary country (most visited)
			const primaryCountry = Object.keys(countryStats).reduce(
				(a, b) => (countryStats[a] > countryStats[b] ? a : b),
				''
			);

			// Find primary city (most visited)
			const primaryCity = Object.keys(cityStats).reduce(
				(a, b) => (cityStats[a] > cityStats[b] ? a : b),
				''
			);

			return {
				primaryCountry,
				primaryCity: primaryCity || undefined,
				allCountries: Array.from(allCountries),
				allCities: Array.from(allCities),
				countryStats,
				cityStats
			};
		} catch (error) {
			console.error('Error analyzing trip locations:', error);
			throw error;
		}
	}

	/**
	 * Suggest an image for a trip based on the analysis
	 */
	async suggestTripImage(
		userId: string,
		startDate: string,
		endDate: string,
		userApiKey?: string
	): Promise<TripImageSuggestion | null> {
		try {
			// Analyze the trip locations
			const analysis = await this.analyzeTripLocations(userId, startDate, endDate);

			if (!analysis.primaryCountry) {
				console.log('No country data available for trip image suggestion');
				return null;
			}

			console.log('Trip analysis:', analysis);

			// Try to get an image based on the primary city first
			if (analysis.primaryCity) {
				console.log(`Suggesting image for primary city: ${analysis.primaryCity}`);
				const cityImage = await getTripBannerImageWithAttribution(analysis.primaryCity, userApiKey);
				if (cityImage) {
					console.log(`Successfully got city image: ${cityImage.imageUrl}`);
					return cityImage;
				}
				console.log('City image suggestion failed, trying country...');
			}

			// Fallback to country-based image
			console.log(`Suggesting image for primary country: ${analysis.primaryCountry}`);
			const countryImage = await getTripBannerImageWithAttribution(
				analysis.primaryCountry,
				userApiKey
			);
			if (countryImage) {
				console.log(`Successfully got country image: ${countryImage.imageUrl}`);
				return countryImage;
			}

			// Final fallback to generic travel image
			console.log('Using generic travel image as fallback');
			const travelImage = await getTripBannerImageWithAttribution('travel', userApiKey);
			if (travelImage) {
				console.log(`Successfully got travel image: ${travelImage.imageUrl}`);
				return travelImage;
			}

			console.log('All image suggestions failed');
			return null;
		} catch (error) {
			console.error('Error suggesting trip image:', error);
			return null;
		}
	}

	/**
	 * Get analysis data for display purposes
	 */
	async getTripAnalysis(
		userId: string,
		startDate: string,
		endDate: string
	): Promise<TripLocationAnalysis> {
		return this.analyzeTripLocations(userId, startDate, endDate);
	}
}
