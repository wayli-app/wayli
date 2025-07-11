import { getUnsplashConfig } from '$lib/core/config/environment';
import { createServerClient } from '$lib/core/supabase/server-client';

export interface UnsplashImage {
  id: string;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  alt_description?: string;
  description?: string;
  location?: {
    title?: string;
    name?: string;
    city?: string;
    country?: string;
  };
  user: {
    name: string;
    username: string;
  };
}

export interface UnsplashSearchResponse {
  results: UnsplashImage[];
  total: number;
  total_pages: number;
}

/**
 * Search for images on Unsplash
 */
export async function searchUnsplashImages(
  query: string,
  page: number = 1,
  perPage: number = 10
): Promise<UnsplashSearchResponse | null> {
  try {
    const unsplashConfig = getUnsplashConfig();
    if (!unsplashConfig.accessKey) {
      console.warn('Unsplash access key not configured');
      return null;
    }

    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('page', page.toString());
    url.searchParams.set('per_page', perPage.toString());
    url.searchParams.set('orientation', 'landscape'); // Prefer landscape images for trip banners

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Client-ID ${unsplashConfig.accessKey}`,
        'Accept-Version': 'v1'
      }
    });

    if (!response.ok) {
      console.error('Unsplash API error:', response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error searching Unsplash images:', error);
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
    const supabase = createServerClient();

    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error('Failed to download image:', response.status, response.statusText);
      return null;
    }

    const imageBuffer = await response.arrayBuffer();
    const imageBlob = new Blob([imageBuffer]);

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, imageBlob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) {
      console.error('Failed to upload image to Supabase Storage:', error);
      return null;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error downloading and uploading image:', error);
    return null;
  }
}

/**
 * Get a random image for a specific location/city and upload to Supabase Storage
 */
export async function getTripBannerImage(cityName: string): Promise<string | null> {
  try {
    // Try to get a city-specific image first
    const searchQuery = `${cityName} city landscape`;
    const response = await searchUnsplashImages(searchQuery, 1, 5);

    if (response && response.results.length > 0) {
      // Get a random image from the results
      const randomIndex = Math.floor(Math.random() * response.results.length);
      const image = response.results[randomIndex];

      // Generate a unique filename
      const fileName = `trips/${cityName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.jpg`;

      // Download and upload to Supabase Storage
      return await downloadAndUploadImage(image.urls.regular, fileName);
    }

    // Fallback to a generic travel image
    const fallbackResponse = await searchUnsplashImages('travel landscape', 1, 5);
    if (fallbackResponse && fallbackResponse.results.length > 0) {
      const randomIndex = Math.floor(Math.random() * fallbackResponse.results.length);
      const image = fallbackResponse.results[randomIndex];

      // Generate a unique filename for fallback
      const fileName = `trips/travel-${Date.now()}.jpg`;

      // Download and upload to Supabase Storage
      return await downloadAndUploadImage(image.urls.regular, fileName);
    }

    return null;
  } catch (error) {
    console.error('Error getting trip banner image:', error);
    return null;
  }
}

/**
 * Get multiple banner images for different cities and upload to Supabase Storage
 */
export async function getMultipleTripBannerImages(cities: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Process cities in parallel with rate limiting
  const promises = cities.map(async (city, index) => {
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, index * 100));

    const imageUrl = await getTripBannerImage(city);
    if (imageUrl) {
      results[city] = imageUrl;
    }
  });

  await Promise.all(promises);
  return results;
}