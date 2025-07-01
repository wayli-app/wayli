export interface UserProfile {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  home_address?: string | {
    display_name: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    address?: Record<string, string | number | boolean>;
  };
  home_location?: {
    lat: number;
    lng: number;
    display_name: string;
    address?: Record<string, string | number | boolean>;
  } | null;
  role: 'user' | 'admin';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  id: string; // References auth.users(id)
  theme: 'light' | 'dark';
  language: string;
  notifications_enabled: boolean;
  timezone?: string;
  created_at: string;
  updated_at: string;
}

export interface UserSecurity {
  twoFactorEnabled: boolean;
  lastPasswordChange?: string;
}

export interface UpdateProfileRequest {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  home_address?: string | {
    display_name: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    address?: Record<string, string | number | boolean>;
  };
  avatar_url?: string;
}

export interface UpdatePreferencesRequest {
  theme?: 'light' | 'dark';
  language?: string;
  notifications_enabled?: boolean;
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