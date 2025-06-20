export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  preferredLanguage: string;
  distanceUnit: string;
  temperatureUnit: string;
  timezone: string;
}

export interface UserSecurity {
  twoFactorEnabled: boolean;
  lastPasswordChange?: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
}

export interface UpdatePreferencesRequest {
  preferredLanguage?: string;
  distanceUnit?: string;
  temperatureUnit?: string;
  timezone?: string;
}

export interface TwoFactorSetupRequest {
  password: string;
}

export interface TwoFactorSetupResponse {
  success: boolean;
  qrCodeUrl: string;
  secret: string;
  message?: string;
}

export interface TwoFactorVerifyRequest {
  code: string;
}

export interface TwoFactorVerifyResponse {
  success: boolean;
  message?: string;
}

export interface TwoFactorDisableRequest {
  password: string;
}

export interface TwoFactorDisableResponse {
  success: boolean;
  message?: string;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdatePasswordResponse {
  success: boolean;
  message?: string;
}