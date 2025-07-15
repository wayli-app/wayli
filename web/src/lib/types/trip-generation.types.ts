export interface TripGenerationData {
  startDate: string;
  endDate: string;
  useCustomHomeAddress: boolean;
  customHomeAddress?: string;
  // New configuration options
  minTripDurationHours?: number;
  maxDistanceFromHomeKm?: number;
  minDataPointsPerDay?: number;
  overnightHoursStart?: number; // 20 for 8 PM
  overnightHoursEnd?: number;   // 8 for 8 AM
  minOvernightHours?: number;   // 6 for minimum overnight stay
}

import type { GeocodedLocation } from './geocoding.types';

export interface TripExclusion {
  id: string;
  name: string;
  value: string;
  exclusion_type: 'city' | 'address' | 'region';
  location?: GeocodedLocation;
  created_at: string;
  updated_at: string;
}

export interface TrackerDataPoint {
  user_id: string;
  location: {
    type: string;
    coordinates: number[];
  };
  recorded_at: string;
  country_code?: string;
  geocode?: {
    address?: {
      city?: string;
      town?: string;
      village?: string;
    };
  };
}

export interface DetectedTrip {
  startDate: string;
  endDate: string;
  title: string;
  description: string;
  location: {
    type: string;
    coordinates: number[];
  };
  cityName: string;
  image_url?: string;
}

// New types for enhanced trip detection
export interface SuggestedTrip {
  id: string;
  user_id: string;
  startDate: string;
  endDate: string;
  title: string;
  description: string;
  location: {
    type: string;
    coordinates: number[];
  };
  cityName: string;
  confidence: number; // 0-1 score
  dataPoints: number;
  overnightStays: number;
  distanceFromHome: number;
  status: 'pending' | 'approved' | 'rejected' | 'created';
  metadata: {
    primaryLocation?: string;
    visitedPlaces?: string[];
    totalDistance?: number;
    averageSpeed?: number;
    transportModes?: string[];
    weatherConditions?: string[];
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface OvernightStay {
  date: string;
  location: {
    type: string;
    coordinates: number[];
  };
  cityName: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  dataPoints: number;
  confidence: number;
}

export interface TripDetectionConfig {
  minTripDurationHours: number;
  maxDistanceFromHomeKm: number;
  minDataPointsPerDay: number;
  overnightHoursStart: number;
  overnightHoursEnd: number;
  minOvernightHours: number;
  homeRadiusKm: number;
  clusteringRadiusMeters: number;
  minConfidenceScore: number;
}

export interface HomeAddress {
  display_name: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
    [key: string]: string | undefined;
  };
}

export interface TripGenerationProgress {
  message: string;
  startDate?: string;
  endDate?: string;
  homeAddress?: string;
  dataPoints?: number;
  exclusionsCount?: number;
  tripsDetected?: number;
  tripsWithBanners?: number;
  tripsGenerated?: number;
  totalTime?: string;
  // New progress fields
  overnightStaysDetected?: number;
  suggestedTripsCount?: number;
  approvedTripsCount?: number;
  imageGenerationProgress?: number;
}

// New types for image generation queue
export interface ImageGenerationJob {
  id: string;
  suggested_trip_id: string;
  user_id: string;
  cityName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  priority: number;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  error?: string;
  image_url?: string;
}