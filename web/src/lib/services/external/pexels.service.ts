import { createClient } from '@supabase/supabase-js';

import { getPexelsConfig } from '$lib/core/config/node-environment';

import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

/**
 * Pexels Image Service
 *
 * This service provides image search functionality using the Pexels API.
 * Pexels offers high-quality, free stock photos and videos.
 */

export interface PexelsImage {
	id: number;
	width: number;
	height: number;
	url: string;
	photographer: string;
	photographer_url: string;
	photographer_id: number;
	avg_color: string;
	src: {
		original: string;
		large2x: string;
		large: string;
		medium: string;
		small: string;
		portrait: string;
		landscape: string;
		tiny: string;
	};
	liked: boolean;
	alt: string;
}

export interface PexelsSearchResponse {
	total_results: number;
	page: number;
	per_page: number;
	photos: PexelsImage[];
	next_page?: string;
}

export interface TripImageResult {
	imageUrl: string;
	attribution?: {
		source: 'pexels' | 'picsum' | 'placeholder';
		photographer?: string;
		photographerUrl?: string;
		pexelsUrl?: string;
	};
}

/**
 * Search for images on Pexels
 */
export async function searchPexelsImages(
	query: string,
	page: number = 1,
	perPage: number = 10,
	userApiKey?: string
): Promise<PexelsSearchResponse | null> {
	try {
		// Prioritize server-set API key, fall back to user's API key if server key is not available
		const serverApiKey = getPexelsConfig().apiKey;
		const apiKey = serverApiKey || userApiKey;
		if (!apiKey) {
			console.warn('⚠️ Pexels API key not configured (neither server nor user key available)');
			return null;
		}

		const url = new URL('https://api.pexels.com/v1/search');
		url.searchParams.set('query', query);
		url.searchParams.set('page', page.toString());
		url.searchParams.set('per_page', perPage.toString());
		url.searchParams.set('orientation', 'landscape'); // Prefer landscape images for trip banners

		const response = await fetch(url.toString(), {
			headers: {
				Authorization: apiKey,
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			console.error('❌ Pexels API error:', response.status, response.statusText);
			return null;
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('❌ Error searching Pexels images:', error);
		return null;
	}
}

/**
 * Download an image from a URL and upload it to Supabase Storage
 */
export async function downloadAndUploadImage(
	imageUrl: string,
	fileName: string,
	bucketName: string = 'trip-images'
): Promise<string | null> {
	try {
		// Create server-side Supabase client with service role key
		const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Download the image with timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

		const response = await fetch(imageUrl, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; Wayli/1.0)'
			}
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			console.error('❌ Failed to download image:', response.status, response.statusText);
			return null;
		}

		const imageBuffer = await response.arrayBuffer();

		// Check if we actually got an image (not an error page)
		if (imageBuffer.byteLength < 1000) {
			console.error('❌ Downloaded file is too small, likely not an image');
			return null;
		}

		// Determine content type from response headers or URL
		let contentType = 'image/jpeg';
		const contentTypeHeader = response.headers.get('content-type');
		if (contentTypeHeader) {
			contentType = contentTypeHeader.split(';')[0];
		} else if (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')) {
			contentType = 'image/jpeg';
		} else if (imageUrl.includes('.png')) {
			contentType = 'image/png';
		} else if (imageUrl.includes('.webp')) {
			contentType = 'image/webp';
		}

		const imageBlob = new Blob([imageBuffer], { type: contentType });

		// Upload to Supabase Storage
		const { error } = await supabase.storage.from(bucketName).upload(fileName, imageBlob, {
			contentType: contentType,
			upsert: true
		});

		if (error) {
			console.error('❌ Failed to upload image to Supabase Storage:', error);
			return null;
		}

		// Get the public URL
		const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);

		return urlData.publicUrl;
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			console.error('❌ Image download timed out');
		} else {
			console.error('❌ Error downloading and uploading image:', error);
		}
		return null;
	}
}

/**
 * Get a random image for a specific location/city with multiple fallback options
 */
export async function getTripBannerImage(
	cityName: string,
	userApiKey?: string
): Promise<string | null> {
	const result = await getTripBannerImageWithAttribution(cityName, userApiKey);
	return result?.imageUrl || null;
}

/**
 * Get a random image for a specific location/city with attribution information
 */
/**
 * Helper function to randomly select a photo from Pexels search results
 */
function getRandomPhotoFromSearchResult(
	searchResult: PexelsSearchResponse | null
): PexelsImage | null {
	if (!searchResult || searchResult.photos.length === 0) {
		return null;
	}

	// Get a random index from the available photos
	const randomIndex = Math.floor(Math.random() * searchResult.photos.length);
	return searchResult.photos[randomIndex];
}

export async function getTripBannerImageWithAttribution(
	cityName: string,
	userApiKey?: string
): Promise<TripImageResult | null> {
	const imageSources: Array<{
		getter: () => Promise<string | null>;
		source: 'pexels' | 'picsum' | 'placeholder';
		getAttribution?: () => Promise<{
			photographer: string;
			photographerUrl: string;
			pexelsUrl: string;
		} | null>;
	}> = [
		// Primary: Pexels API search
		{
			getter: async () => {
				const searchResult = await searchPexelsImages(
					`${cityName} city landscape`,
					1,
					15,
					userApiKey
				);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return randomPhoto.src.large;
				}
				return null;
			},
			source: 'pexels',
			getAttribution: async () => {
				const searchResult = await searchPexelsImages(
					`${cityName} city landscape`,
					1,
					15,
					userApiKey
				);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return {
						photographer: randomPhoto.photographer,
						photographerUrl: randomPhoto.photographer_url,
						pexelsUrl: randomPhoto.url
					};
				}
				return null;
			}
		},
		// Fallback 1: Generic city landscape
		{
			getter: async () => {
				const searchResult = await searchPexelsImages(`${cityName} landscape`, 1, 15, userApiKey);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return randomPhoto.src.large;
				}
				return null;
			},
			source: 'pexels',
			getAttribution: async () => {
				const searchResult = await searchPexelsImages(`${cityName} landscape`, 1, 15, userApiKey);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return {
						photographer: randomPhoto.photographer,
						photographerUrl: randomPhoto.photographer_url,
						pexelsUrl: randomPhoto.url
					};
				}
				return null;
			}
		},
		// Fallback 2: Country-based search
		{
			getter: async () => {
				const searchResult = await searchPexelsImages(`${cityName} travel`, 1, 15, userApiKey);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return randomPhoto.src.large;
				}
				return null;
			},
			source: 'pexels',
			getAttribution: async () => {
				const searchResult = await searchPexelsImages(`${cityName} travel`, 1, 15, userApiKey);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return {
						photographer: randomPhoto.photographer,
						photographerUrl: randomPhoto.photographer_url,
						pexelsUrl: randomPhoto.url
					};
				}
				return null;
			}
		},
		// Fallback 3: Generic travel image
		{
			getter: async () => {
				const searchResult = await searchPexelsImages('travel landscape', 1, 15, userApiKey);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return randomPhoto.src.large;
				}
				return null;
			},
			source: 'pexels',
			getAttribution: async () => {
				const searchResult = await searchPexelsImages('travel landscape', 1, 15, userApiKey);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return {
						photographer: randomPhoto.photographer,
						photographerUrl: randomPhoto.photographer_url,
						pexelsUrl: randomPhoto.url
					};
				}
				return null;
			}
		},
		// Fallback 4: Generic city image
		{
			getter: async () => {
				const searchResult = await searchPexelsImages('city landscape', 1, 15, userApiKey);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return randomPhoto.src.large;
				}
				return null;
			},
			source: 'pexels',
			getAttribution: async () => {
				const searchResult = await searchPexelsImages('city landscape', 1, 15, userApiKey);
				const randomPhoto = getRandomPhotoFromSearchResult(searchResult);
				if (randomPhoto) {
					return {
						photographer: randomPhoto.photographer,
						photographerUrl: randomPhoto.photographer_url,
						pexelsUrl: randomPhoto.url
					};
				}
				return null;
			}
		},
		// Fallback 5: Picsum with proper MIME type
		{
			getter: () => Promise.resolve(`https://picsum.photos/800/400.jpg?random=${Date.now()}`),
			source: 'picsum'
		},
		// Fallback 6: Alternative placeholder service
		{
			getter: () =>
				Promise.resolve(
					`https://placehold.co/800x400/3b82f6/ffffff?text=${encodeURIComponent(cityName)}`
				),
			source: 'placeholder'
		},
		// Fallback 7: Another placeholder service
		{
			getter: () =>
				Promise.resolve(
					`https://dummyimage.com/800x400/3b82f6/ffffff&text=${encodeURIComponent(cityName)}`
				),
			source: 'placeholder'
		}
	];

	for (let i = 0; i < imageSources.length; i++) {
		try {
			console.log(`🖼️ Trying image source ${i + 1}/${imageSources.length}`);

			const source = imageSources[i];
			const imageUrl = await source.getter();

			if (!imageUrl) {
				console.log(`🖼️ Source ${i + 1} returned no image URL`);
				continue;
			}

			const fileName = `trips/${cityName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${i}.jpg`;

			const result = await downloadAndUploadImage(imageUrl, fileName);
			if (result) {
				console.log(`✅ Successfully got image from source ${i + 1}`);

				// Get attribution if available
				let attribution = null;
				if (source.getAttribution) {
					try {
						attribution = await source.getAttribution();
					} catch (error) {
						console.warn('⚠️ Failed to get attribution:', error);
					}
				}

				return {
					imageUrl: result,
					attribution: attribution
						? {
								source: source.source,
								...attribution
							}
						: {
								source: source.source
							}
				};
			}
		} catch (error) {
			console.error(`❌ Failed to get image from source ${i + 1}:`, error);
			// Continue to next source
		}

		// Add a small delay between attempts
		if (i < imageSources.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	console.log('❌ All image sources failed');
	return null;
}

/**
 * Get multiple banner images for different cities using Pexels API
 */
export async function getMultipleTripBannerImages(
	cities: string[],
	userApiKey?: string
): Promise<Record<string, string>> {
	const results: Record<string, string> = {};

	// Process cities sequentially to avoid overwhelming the service
	for (const city of cities) {
		try {
			const imageUrl = await getTripBannerImage(city, userApiKey);
			if (imageUrl) {
				results[city] = imageUrl;
			}
			// Add a small delay between requests
			await new Promise((resolve) => setTimeout(resolve, 200));
		} catch (error) {
			console.error(`❌ Error getting image for ${city}:`, error);
		}
	}

	return results;
}
