export interface TripGenerationData {
  startDate: string;
  endDate: string;
  useCustomHomeAddress: boolean;
  customHomeAddress?: string;
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
  reverse_geocode?: {
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

export interface HomeAddress {
  display_name: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  address?: Record<string, string | number | boolean>;
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
}