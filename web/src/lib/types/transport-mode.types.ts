export enum TransportDetectionReason {
  VELOCITY_RANGE = 'Velocity between X and Y',
  HIGH_VELOCITY_PLANE = 'Velocity above 400 km/h, segment marked as plane',
  TRAIN_STATION_AND_SPEED = 'Visited train station and then travelled at train-like speed',
  AIRPORT_AND_PLANE_SPEED = 'Visited airport and then travelled at plane speed',
  PLANE_SPEED_ONLY = 'Speed above 350 km/h, likely plane',
  TRAIN_SPEED_ONLY = 'Speed in train range, likely train',
  CAR_SPEED_ONLY = 'Speed in car range, likely car',
  WALKING_SPEED_ONLY = 'Speed in walking range, likely walking',
  CYCLING_SPEED_ONLY = 'Speed in cycling range, likely cycling',
  KEEP_CONTINUITY = 'Mode continuity',
  SUSPICIOUS_SEGMENT = 'Implausible segment, flagged as suspicious',
  MIN_DURATION_NOT_MET = 'Minimum duration for mode not met',
  GEOGRAPHICALLY_IMPLAUSIBLE = 'Segment start/end not plausible for mode',
  GOLF_COURSE_WALKING = 'Walking on a golf course, likely walking',
  DEFAULT = 'Default detection logic',
  HIGHWAY_OR_MOTORWAY = 'Detected motorway or highway, assumed car',
  FAST_SEGMENT = 'Fast segment, possible high-speed travel'
}