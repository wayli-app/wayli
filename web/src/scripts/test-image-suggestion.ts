import { getTripBannerImage } from '../lib/services/external/pexels.service';

async function testImageSuggestion() {
  console.log('Testing image suggestion with fallbacks...');

  const testCities = ['Amsterdam', 'Paris', 'Tokyo'];

  for (const city of testCities) {
    console.log(`\n--- Testing ${city} ---`);
    try {
      const imageUrl = await getTripBannerImage(city);
      if (imageUrl) {
        console.log(`✅ Success: ${imageUrl}`);
      } else {
        console.log(`❌ Failed: No image returned`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

testImageSuggestion().catch(console.error);