// Frontend Services - Replacing backend edge functions
export { StatisticsService } from './statistics.service';
export { TripLocationsService } from './trip-locations.service';
export { TripsService } from './trips.service';

// Existing Services
export { LocationCacheService } from './location-cache.service';
export { UserProfileService } from './user-profile.service';
export { TOTPService } from './totp.service';
export { EnhancedPoiDetectionService } from './enhanced-poi-detection.service';

// External Services (functions, not classes)
export { reverseGeocode, forwardGeocode } from './external/nominatim.service';
export { uploadTripImage } from './external/image-upload.service';
