// src/lib/core/config/environment.ts
// Only include public, client-safe config!

export function getNominatimConfig() {
  return {
    endpoint: 'https://nominatim.openstreetmap.org',
    rateLimit: 1 // 1 request per second
  };
}