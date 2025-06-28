#!/usr/bin/env bun

import { reverseGeocode } from '../lib/services/nominatim.service';

async function testNominatimService() {
  console.log('🧪 Testing Nominatim reverse geocoding service...\n');

  const testCoordinates = [
    { lat: 52.37311615, lon: 4.892351098497149, name: 'Dam Square, Amsterdam' },
    { lat: 48.8584, lon: 2.2945, name: 'Eiffel Tower, Paris' },
    { lat: 40.7589, lon: -73.9851, name: 'Times Square, New York' }
  ];

  for (const coord of testCoordinates) {
    try {
      console.log(`📍 Testing: ${coord.name} (${coord.lat}, ${coord.lon})`);
      const result = await reverseGeocode(coord.lat, coord.lon);
      console.log(`✅ Result: ${result.display_name}`);
      console.log(`   Place ID: ${result.place_id}`);
      console.log(`   Type: ${result.type}`);
      if (result.address) {
        console.log(`   Address components:`, Object.keys(result.address).slice(0, 5).join(', '));
      }
      console.log('');
    } catch (error) {
      console.error(`❌ Error geocoding ${coord.name}:`, error);
      console.log('');
    }
  }

  console.log('✅ Nominatim service test completed!');
}

testNominatimService().catch(console.error);