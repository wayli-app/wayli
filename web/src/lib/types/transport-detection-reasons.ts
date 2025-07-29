// Shared enum for transport detection reasons
// This reduces bandwidth by sending enum keys instead of full text descriptions
export enum TransportDetectionReason {
  HIGH_VELOCITY_PLANE = 'HIGH_VELOCITY_PLANE',
  TRAIN_STATION_AND_SPEED = 'TRAIN_STATION_AND_SPEED',
  AIRPORT_AND_PLANE_SPEED = 'AIRPORT_AND_PLANE_SPEED',
  PLANE_SPEED_ONLY = 'PLANE_SPEED_ONLY',
  TRAIN_SPEED_ONLY = 'TRAIN_SPEED_ONLY',
  CAR_SPEED_ONLY = 'CAR_SPEED_ONLY',
  WALKING_SPEED_ONLY = 'WALKING_SPEED_ONLY',
  CYCLING_SPEED_ONLY = 'CYCLING_SPEED_ONLY',
  STATIONARY_SPEED_ONLY = 'STATIONARY_SPEED_ONLY',
  HIGHWAY_OR_MOTORWAY = 'HIGHWAY_OR_MOTORWAY',
  FAST_SEGMENT = 'FAST_SEGMENT',
  CONTINUITY_BROKEN = 'CONTINUITY_BROKEN',
  KEEP_CONTINUITY = 'KEEP_CONTINUITY',
  SUSPICIOUS_SEGMENT = 'SUSPICIOUS_SEGMENT',
  MIN_DURATION_NOT_MET = 'MIN_DURATION_NOT_MET',
  GEOGRAPHICALLY_IMPLAUSIBLE = 'GEOGRAPHICALLY_IMPLAUSIBLE',
  GOLF_COURSE_WALKING = 'GOLF_COURSE_WALKING',
  DEFAULT = 'DEFAULT'
}

// Frontend translation map for user-friendly display
export const TRANSPORT_DETECTION_REASON_LABELS: Record<TransportDetectionReason, string> = {
  [TransportDetectionReason.HIGH_VELOCITY_PLANE]: 'Velocity above 400 km/h, segment marked as plane',
  [TransportDetectionReason.TRAIN_STATION_AND_SPEED]: 'Visited train station and then travelled at train-like speed',
  [TransportDetectionReason.AIRPORT_AND_PLANE_SPEED]: 'Visited airport and then travelled at plane speed',
  [TransportDetectionReason.PLANE_SPEED_ONLY]: 'Speed above 350 km/h, likely plane',
  [TransportDetectionReason.TRAIN_SPEED_ONLY]: 'Speed in train range, likely train',
  [TransportDetectionReason.CAR_SPEED_ONLY]: 'Speed in car range, likely car',
  [TransportDetectionReason.WALKING_SPEED_ONLY]: 'Speed in walking range, likely walking',
  [TransportDetectionReason.CYCLING_SPEED_ONLY]: 'Speed in cycling range, likely cycling',
  [TransportDetectionReason.STATIONARY_SPEED_ONLY]: 'Speed below 2 km/h, likely stationary or idle',
  [TransportDetectionReason.HIGHWAY_OR_MOTORWAY]: 'Detected motorway or highway, assumed car',
  [TransportDetectionReason.FAST_SEGMENT]: 'Fast segment, possible high-speed travel',
  [TransportDetectionReason.CONTINUITY_BROKEN]: 'Continuity broken, mode reset',
  [TransportDetectionReason.KEEP_CONTINUITY]: 'Continuity maintained, mode preserved',
  [TransportDetectionReason.SUSPICIOUS_SEGMENT]: 'Suspicious segment detected',
  [TransportDetectionReason.MIN_DURATION_NOT_MET]: 'Minimum duration not met for mode',
  [TransportDetectionReason.GEOGRAPHICALLY_IMPLAUSIBLE]: 'Geographically implausible movement',
  [TransportDetectionReason.GOLF_COURSE_WALKING]: 'Walking on a golf course, likely walking',
  [TransportDetectionReason.DEFAULT]: 'Default mode assignment'
};

// Helper function to get user-friendly label
export function getTransportDetectionReasonLabel(reason: TransportDetectionReason | string): string {
  if (Object.values(TransportDetectionReason).includes(reason as TransportDetectionReason)) {
    return TRANSPORT_DETECTION_REASON_LABELS[reason as TransportDetectionReason];
  }
  // Fallback for legacy string values or unknown reasons
  return reason as string;
}